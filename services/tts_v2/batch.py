"""
HumanMirage TTS - Batch Processing
Efficient processing of multiple texts with job queuing
"""

import asyncio
import uuid
import time
from typing import List, Dict, Optional, Callable, Any
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
import json
import logging
from datetime import datetime
import threading
from concurrent.futures import ThreadPoolExecutor

import numpy as np

logger = logging.getLogger(__name__)


class JobStatus(str, Enum):
    """Job processing status."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class TTSJob:
    """Single TTS job."""
    id: str
    text: str
    voice_id: Optional[str] = None
    emotion: str = "neutral"
    language: str = "en"
    
    # Status tracking
    status: JobStatus = JobStatus.PENDING
    progress: float = 0.0
    error: Optional[str] = None
    
    # Results
    audio: Optional[np.ndarray] = None
    duration: float = 0.0
    output_path: Optional[str] = None
    
    # Timing
    created_at: datetime = field(default_factory=datetime.now)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # Callbacks
    on_complete: Optional[Callable] = None
    on_error: Optional[Callable] = None
    
    @property
    def processing_time(self) -> Optional[float]:
        """Get processing time in seconds."""
        if self.started_at and self.completed_at:
            return (self.completed_at - self.started_at).total_seconds()
        return None


@dataclass
class BatchJob:
    """Batch of multiple TTS jobs."""
    id: str
    jobs: List[TTSJob] = field(default_factory=list)
    
    # Batch settings
    output_dir: Optional[str] = None
    combine_output: bool = False
    
    # Status
    status: JobStatus = JobStatus.PENDING
    
    # Timing
    created_at: datetime = field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None
    
    @property
    def progress(self) -> float:
        """Get overall batch progress."""
        if not self.jobs:
            return 0.0
        completed = sum(1 for j in self.jobs if j.status in [JobStatus.COMPLETED, JobStatus.FAILED])
        return completed / len(self.jobs)
    
    @property
    def completed_jobs(self) -> List[TTSJob]:
        """Get completed jobs."""
        return [j for j in self.jobs if j.status == JobStatus.COMPLETED]
    
    @property
    def failed_jobs(self) -> List[TTSJob]:
        """Get failed jobs."""
        return [j for j in self.jobs if j.status == JobStatus.FAILED]
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "id": self.id,
            "status": self.status.value,
            "progress": self.progress,
            "total_jobs": len(self.jobs),
            "completed": len(self.completed_jobs),
            "failed": len(self.failed_jobs),
            "created_at": self.created_at.isoformat(),
            "jobs": [
                {
                    "id": j.id,
                    "text": j.text[:50] + "..." if len(j.text) > 50 else j.text,
                    "status": j.status.value,
                    "duration": j.duration,
                    "output_path": j.output_path,
                }
                for j in self.jobs
            ]
        }


class BatchProcessor:
    """
    Batch TTS processor with job queue.
    
    Features:
    - Async job queue
    - Concurrent processing
    - Progress tracking
    - Automatic retry on failure
    - Output file management
    """
    
    def __init__(
        self,
        tts_engine,
        max_concurrent: int = 4,
        max_retries: int = 2,
    ):
        self.tts = tts_engine
        self.max_concurrent = max_concurrent
        self.max_retries = max_retries
        
        # Job storage
        self._jobs: Dict[str, TTSJob] = {}
        self._batches: Dict[str, BatchJob] = {}
        
        # Processing queue
        self._queue: asyncio.Queue = None
        self._workers: List[asyncio.Task] = []
        self._running = False
        
        # Thread pool for file I/O
        self._executor = ThreadPoolExecutor(max_workers=4)
    
    async def start(self):
        """Start the batch processor."""
        if self._running:
            return
        
        self._running = True
        self._queue = asyncio.Queue()
        
        # Start worker tasks
        for i in range(self.max_concurrent):
            worker = asyncio.create_task(self._worker(i))
            self._workers.append(worker)
        
        logger.info(f"Batch processor started with {self.max_concurrent} workers")
    
    async def stop(self):
        """Stop the batch processor."""
        self._running = False
        
        # Cancel workers
        for worker in self._workers:
            worker.cancel()
        
        await asyncio.gather(*self._workers, return_exceptions=True)
        self._workers.clear()
        
        logger.info("Batch processor stopped")
    
    def create_batch(
        self,
        texts: List[Dict[str, Any]],
        output_dir: Optional[str] = None,
        combine: bool = False,
    ) -> BatchJob:
        """
        Create a batch job from list of texts.
        
        Args:
            texts: List of dicts with 'text', 'voice_id', 'emotion', 'language'
            output_dir: Directory to save output files
            combine: Whether to combine all outputs into one file
        """
        batch_id = str(uuid.uuid4())[:8]
        
        jobs = []
        for i, item in enumerate(texts):
            job = TTSJob(
                id=f"{batch_id}_{i}",
                text=item.get('text', ''),
                voice_id=item.get('voice_id'),
                emotion=item.get('emotion', 'neutral'),
                language=item.get('language', 'en'),
            )
            jobs.append(job)
            self._jobs[job.id] = job
        
        batch = BatchJob(
            id=batch_id,
            jobs=jobs,
            output_dir=output_dir,
            combine_output=combine,
        )
        
        self._batches[batch_id] = batch
        
        return batch
    
    async def submit_batch(self, batch: BatchJob):
        """Submit batch for processing."""
        if not self._running:
            await self.start()
        
        batch.status = JobStatus.PROCESSING
        
        # Add all jobs to queue
        for job in batch.jobs:
            await self._queue.put((batch.id, job))
        
        logger.info(f"Submitted batch {batch.id} with {len(batch.jobs)} jobs")
    
    async def wait_for_batch(self, batch_id: str) -> BatchJob:
        """Wait for batch to complete."""
        batch = self._batches.get(batch_id)
        if not batch:
            raise ValueError(f"Batch not found: {batch_id}")
        
        while batch.progress < 1.0:
            await asyncio.sleep(0.1)
        
        return batch
    
    async def _worker(self, worker_id: int):
        """Worker coroutine for processing jobs."""
        logger.debug(f"Worker {worker_id} started")
        
        while self._running:
            try:
                # Get job from queue
                batch_id, job = await asyncio.wait_for(
                    self._queue.get(),
                    timeout=1.0
                )
                
                await self._process_job(job, batch_id)
                
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Worker {worker_id} error: {e}")
    
    async def _process_job(self, job: TTSJob, batch_id: str):
        """Process a single job."""
        from pipeline import Emotion
        
        job.status = JobStatus.PROCESSING
        job.started_at = datetime.now()
        
        retries = 0
        
        while retries <= self.max_retries:
            try:
                # Synthesize
                audio = await self.tts.synthesize(
                    text=job.text,
                    speaker_id=job.voice_id,
                    emotion=Emotion(job.emotion),
                    language=job.language,
                )
                
                job.audio = audio
                job.duration = len(audio) / self.tts.config.sample_rate
                
                # Save to file if output dir specified
                batch = self._batches.get(batch_id)
                if batch and batch.output_dir:
                    output_path = Path(batch.output_dir) / f"{job.id}.wav"
                    await self._save_audio(audio, output_path)
                    job.output_path = str(output_path)
                
                job.status = JobStatus.COMPLETED
                job.completed_at = datetime.now()
                
                logger.debug(f"Job {job.id} completed in {job.processing_time:.2f}s")
                
                # Callback
                if job.on_complete:
                    job.on_complete(job)
                
                break
                
            except Exception as e:
                retries += 1
                logger.warning(f"Job {job.id} failed (attempt {retries}): {e}")
                
                if retries > self.max_retries:
                    job.status = JobStatus.FAILED
                    job.error = str(e)
                    job.completed_at = datetime.now()
                    
                    if job.on_error:
                        job.on_error(job, e)
                else:
                    await asyncio.sleep(1)  # Wait before retry
    
    async def _save_audio(self, audio: np.ndarray, path: Path):
        """Save audio to file."""
        import wave
        
        path.parent.mkdir(parents=True, exist_ok=True)
        
        def _write():
            audio_int16 = (audio * 32767).astype(np.int16)
            with wave.open(str(path), 'w') as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(self.tts.config.sample_rate)
                wav.writeframes(audio_int16.tobytes())
        
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(self._executor, _write)
    
    def get_job(self, job_id: str) -> Optional[TTSJob]:
        """Get job by ID."""
        return self._jobs.get(job_id)
    
    def get_batch(self, batch_id: str) -> Optional[BatchJob]:
        """Get batch by ID."""
        return self._batches.get(batch_id)
    
    def get_all_batches(self) -> List[BatchJob]:
        """Get all batches."""
        return list(self._batches.values())


# CSV/JSON import helpers
def load_batch_from_csv(csv_path: str) -> List[Dict[str, Any]]:
    """
    Load batch input from CSV file.
    
    Expected columns: text, voice_id, emotion, language
    """
    import csv
    
    texts = []
    
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            texts.append({
                'text': row.get('text', ''),
                'voice_id': row.get('voice_id'),
                'emotion': row.get('emotion', 'neutral'),
                'language': row.get('language', 'en'),
            })
    
    return texts


def load_batch_from_json(json_path: str) -> List[Dict[str, Any]]:
    """
    Load batch input from JSON file.
    
    Expected format: [{"text": "...", "voice_id": "...", ...}, ...]
    """
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    if isinstance(data, list):
        return data
    elif isinstance(data, dict) and 'texts' in data:
        return data['texts']
    else:
        raise ValueError("Invalid JSON format")


def load_batch_from_txt(txt_path: str, voice_id: str = None) -> List[Dict[str, Any]]:
    """
    Load batch input from plain text file.
    One text per line.
    """
    texts = []
    
    with open(txt_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                texts.append({
                    'text': line,
                    'voice_id': voice_id,
                    'emotion': 'neutral',
                    'language': 'en',
                })
    
    return texts
