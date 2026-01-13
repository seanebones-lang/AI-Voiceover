// NextEleven - Studio-Quality Voice AI
const API_BASE = window.location.origin;

// Global state
let voices = [];
let allVoices = [];
let currentAudioBlob = null;
let selectedFiles = [];
let conversationMessages = [];

// Voice recording state
let mediaRecorder = null;
let audioChunks = [];
let recordingStream = null;
let recordingTimer = null;
let recordingStartTime = 0;
let recordedAudioBlob = null;

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

async function initializeApp() {
    await loadVoices();
    setupEventListeners();
    setupDragAndDrop();
    addInitialConversationMessage();
    console.log('🎙️ NextEleven initialized');
}

// Event Listeners
function setupEventListeners() {
    const textInput = document.getElementById('textInput');
    const audioFiles = document.getElementById('audioFiles');

    textInput?.addEventListener('input', updateCharCount);
    audioFiles?.addEventListener('change', handleFileSelect);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            generateSpeech();
        }
    });
}

// Tab Switching
function switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden');
    });

    // Remove active state from all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('tab-active', 'text-brand-400');
        btn.classList.add('text-gray-400', 'border-transparent');
    });

    // Show selected tab
    const selectedTab = document.getElementById(`tab-${tabName}`);
    if (selectedTab) {
        selectedTab.classList.remove('hidden');
    }

    // Add active state to clicked button
    const clickedBtn = event.target.closest('.tab-btn');
    if (clickedBtn) {
        clickedBtn.classList.remove('text-gray-400', 'border-transparent');
        clickedBtn.classList.add('tab-active', 'text-brand-400');
    }

    // Populate voice selects for compare tab
    if (tabName === 'compare') {
        populateCompareVoices();
    }
}

// Load Voices from API
async function loadVoices() {
    try {
        const response = await fetch(`${API_BASE}/api/voices`);
        if (!response.ok) throw new Error('Failed to load voices');

        const data = await response.json();
        voices = data.voices || [];
        allVoices = voices;

        populateVoiceSelect('voiceSelect');
        console.log(`✅ Loaded ${voices.length} voices`);
    } catch (error) {
        console.error('Error loading voices:', error);
        // Show default voice option
        const select = document.getElementById('voiceSelect');
        if (select) {
            select.innerHTML = '<option value="default_english">Default English</option>';
        }
    }
}

function populateVoiceSelect(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;

    select.innerHTML = '<option value="">-- Select a Voice --</option>';

    // Group by source
    const clonedVoices = voices.filter(v => v.source === 'cloned');
    const standardVoices = voices.filter(v => v.source !== 'cloned');

    // Cloned voices first
    if (clonedVoices.length > 0) {
        const clonedGroup = document.createElement('optgroup');
        clonedGroup.label = `🎤 Your Cloned Voices (${clonedVoices.length})`;
        clonedVoices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.voice_id;
            option.textContent = voice.name;
            clonedGroup.appendChild(option);
        });
        select.appendChild(clonedGroup);
    }

    // Standard voices
    if (standardVoices.length > 0) {
        const standardGroup = document.createElement('optgroup');
        standardGroup.label = `🌐 Standard Voices (${standardVoices.length})`;
        standardVoices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.voice_id;
            option.textContent = `${voice.name} (${voice.language || 'en'})`;
            standardGroup.appendChild(option);
        });
        select.appendChild(standardGroup);
    }
}

function populateCompareVoices() {
    populateVoiceSelect('compareVoice1');
    populateVoiceSelect('compareVoice2');
}

// Character Counter
function updateCharCount() {
    const textInput = document.getElementById('textInput');
    const charCount = document.getElementById('charCount');
    if (textInput && charCount) {
        charCount.textContent = textInput.value.length;
    }
}

// Text to Speech Generation
async function generateSpeech() {
    const textInput = document.getElementById('textInput');
    const voiceSelect = document.getElementById('voiceSelect');
    const languageSelect = document.getElementById('languageSelect');
    const generateBtn = document.getElementById('generateBtn');
    const btnText = document.getElementById('btnText');

    const text = textInput?.value.trim();
    const voiceId = voiceSelect?.value || 'default_english';
    const language = languageSelect?.value || 'en';

    if (!text) {
        showError('Please enter some text');
        return;
    }

    generateBtn.disabled = true;
    btnText.textContent = 'Generating...';

    try {
        const response = await fetch(`${API_BASE}/api/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                voice_id: voiceId,
                language
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Generation failed');
        }

        const audioBlob = await response.blob();
        currentAudioBlob = audioBlob;

        // Show audio player
        const audioUrl = URL.createObjectURL(audioBlob);
        const audioElement = document.getElementById('audioElement');
        audioElement.src = audioUrl;

        const audioCard = document.getElementById('audioPlayerCard');
        audioCard.classList.remove('hidden');

        const errorMsg = document.getElementById('errorMessage');
        errorMsg.classList.add('hidden');

        console.log('✅ Audio generated successfully');
    } catch (error) {
        console.error('Error generating speech:', error);
        showError(error.message || 'Failed to generate speech');
    } finally {
        generateBtn.disabled = false;
        btnText.textContent = 'Generate Speech';
    }
}

// Audio Actions
function clearAudio() {
    const audioCard = document.getElementById('audioPlayerCard');
    audioCard.classList.add('hidden');

    const audioElement = document.getElementById('audioElement');
    audioElement.pause();
    audioElement.src = '';
    currentAudioBlob = null;
}

function downloadAudio() {
    if (!currentAudioBlob) {
        showError('No audio to download');
        return;
    }

    const url = URL.createObjectURL(currentAudioBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexteleven-${Date.now()}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('✅ Audio downloaded');
}

// Voice Cloning - Drag and Drop
function setupDragAndDrop() {
    const uploadZone = document.getElementById('uploadZone');
    if (!uploadZone) return;

    uploadZone.addEventListener('click', () => {
        document.getElementById('audioFiles').click();
    });

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('border-brand-400');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('border-brand-400');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('border-brand-400');

        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/'));
        handleFiles(files);
    });
}

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    handleFiles(files);
}

function handleFiles(files) {
    if (files.length === 0) return;

    if (files.length > 5) {
        showCloneError('Maximum 5 files allowed');
        return;
    }

    selectedFiles = files;
    renderFileList();
}

function renderFileList() {
    const fileList = document.getElementById('fileList');
    if (!fileList) return;

    if (selectedFiles.length === 0) {
        fileList.innerHTML = '';
        return;
    }

    fileList.innerHTML = selectedFiles.map((file, index) => `
        <div class="flex items-center justify-between p-3 rounded-lg bg-dark-700 border border-white/5">
            <div class="flex items-center space-x-3 flex-1">
                <i data-lucide="file-audio" class="w-4 h-4 text-brand-400 flex-shrink-0"></i>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-white truncate">${file.name}</p>
                    <p class="text-xs text-gray-500">${formatFileSize(file.size)}</p>
                </div>
            </div>
            <button
                onclick="removeFile(${index})"
                class="p-2 rounded-lg hover:bg-dark-600 transition-colors flex-shrink-0"
            >
                <i data-lucide="x" class="w-4 h-4 text-gray-400"></i>
            </button>
        </div>
    `).join('');

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function removeFile(index) {
    selectedFiles.splice(index, 1);
    renderFileList();
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Voice Recording
async function toggleRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        stopRecording();
    } else {
        await startRecording();
    }
}

async function startRecording() {
    try {
        recordingStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        const options = { mimeType: 'audio/webm' };
        mediaRecorder = new MediaRecorder(recordingStream, options);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            recordedAudioBlob = audioBlob;
            displayRecordedAudio(audioBlob);
        };

        mediaRecorder.start();
        recordingStartTime = Date.now();
        updateRecordingUI(true);
        startRecordingTimer();

        console.log('✅ Recording started');
    } catch (error) {
        console.error('Error starting recording:', error);
        alert('Microphone access denied. Please allow microphone access.');
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();

        if (recordingStream) {
            recordingStream.getTracks().forEach(track => track.stop());
        }

        stopRecordingTimer();
        updateRecordingUI(false);

        console.log('✅ Recording stopped');
    }
}

function startRecordingTimer() {
    const timerElement = document.getElementById('recordingTimer');
    if (!timerElement) return;

    recordingTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
}

function stopRecordingTimer() {
    if (recordingTimer) {
        clearInterval(recordingTimer);
        recordingTimer = null;
    }
}

function updateRecordingUI(isRecording) {
    const micButton = document.getElementById('micButton');
    const recordingStatus = document.getElementById('recordingStatus');
    const recordingTimerEl = document.getElementById('recordingTimer');
    const recordingControls = document.getElementById('recordingControls');
    const recordingPulse = document.getElementById('recordingPulse');

    if (isRecording) {
        micButton?.classList.add('bg-red-600');
        recordingPulse?.classList.remove('hidden');
        recordingStatus.innerHTML = '<span class="text-red-400">🔴 Recording...</span>';
        recordingTimerEl?.classList.remove('hidden');
        recordingControls?.classList.remove('hidden');
    } else {
        micButton?.classList.remove('bg-red-600');
        recordingPulse?.classList.add('hidden');
        recordingStatus.textContent = 'Click microphone to start recording';
        recordingTimerEl?.classList.add('hidden');
        recordingControls?.classList.add('hidden');
    }
}

function displayRecordedAudio(audioBlob) {
    const container = document.getElementById('recordedAudioContainer');
    const audioElement = document.getElementById('recordedAudio');
    const durationElement = document.getElementById('recordedDuration');

    if (!container || !audioElement) return;

    const audioUrl = URL.createObjectURL(audioBlob);
    audioElement.src = audioUrl;
    container.classList.remove('hidden');

    audioElement.addEventListener('loadedmetadata', () => {
        const duration = Math.floor(audioElement.duration);
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        durationElement.textContent = `Duration: ${minutes}:${seconds.toString().padStart(2, '0')}`;
    }, { once: true });

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function deleteRecording() {
    recordedAudioBlob = null;
    audioChunks = [];

    const container = document.getElementById('recordedAudioContainer');
    const audioElement = document.getElementById('recordedAudio');
    const timerElement = document.getElementById('recordingTimer');

    if (container) container.classList.add('hidden');
    if (audioElement) {
        audioElement.pause();
        audioElement.src = '';
    }
    if (timerElement) timerElement.textContent = '0:00';
}

function addRecordingToFiles() {
    if (!recordedAudioBlob) {
        alert('No recording to add');
        return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `voice-recording-${timestamp}.webm`;
    const file = new File([recordedAudioBlob], fileName, { type: 'audio/webm' });

    if (selectedFiles.length >= 5) {
        showCloneError('Maximum 5 files allowed');
        return;
    }

    selectedFiles.push(file);
    renderFileList();
    deleteRecording();

    const status = document.getElementById('recordingStatus');
    if (status) {
        status.innerHTML = '<span class="text-brand-400">✓ Recording added!</span>';
        setTimeout(() => {
            status.textContent = 'Click microphone to start recording';
        }, 3000);
    }
}

// Clone Voice
async function cloneVoice() {
    const name = document.getElementById('cloneName')?.value.trim();
    const description = document.getElementById('cloneDescription')?.value.trim();

    if (!name) {
        showCloneError('Please enter a voice name');
        return;
    }

    if (selectedFiles.length === 0) {
        showCloneError('Please upload at least one audio file or record your voice');
        return;
    }

    const cloneBtn = document.getElementById('cloneBtn');
    const cloneBtnText = document.getElementById('cloneBtnText');

    cloneBtn.disabled = true;
    cloneBtnText.textContent = 'Cloning Voice...';

    try {
        const formData = new FormData();
        formData.append('name', name);
        if (description) formData.append('description', description);

        selectedFiles.forEach((file) => {
            formData.append('files', file);
        });

        const response = await fetch(`${API_BASE}/api/clone-voice`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Clone failed');
        }

        showCloneSuccess(`🎉 Voice "${name}" cloned successfully! Voice ID: ${data.voice_id}`);

        // Clear form
        document.getElementById('cloneName').value = '';
        document.getElementById('cloneDescription').value = '';
        selectedFiles = [];
        renderFileList();

        // Reload voices
        await loadVoices();

        console.log('✅ Voice cloned:', data.voice_id);
    } catch (error) {
        console.error('Error cloning voice:', error);
        showCloneError(error.message || 'Failed to clone voice');
    } finally {
        cloneBtn.disabled = false;
        cloneBtnText.textContent = 'Clone Voice';
    }
}

// Conversation
function addInitialConversationMessage() {
    if (conversationMessages.length === 0) {
        addConversationMessage();
    }
}

function addConversationMessage() {
    const id = Date.now();
    conversationMessages.push({ id, speaker: '', voice_id: '', text: '' });
    renderConversationMessages();
}

function renderConversationMessages() {
    const container = document.getElementById('conversationList');
    if (!container) return;

    container.innerHTML = conversationMessages.map((msg, index) => `
        <div class="p-4 rounded-xl bg-dark-700 border border-white/5 space-y-3">
            <div class="flex items-center justify-between">
                <input
                    type="text"
                    class="flex-1 px-3 py-2 rounded-lg input-field text-white text-sm"
                    placeholder="Speaker name"
                    value="${msg.speaker}"
                    onchange="updateConversationMessage(${index}, 'speaker', this.value)"
                >
                <button class="ml-2 p-2 rounded-lg hover:bg-dark-600 text-gray-400" onclick="removeConversationMessage(${index})">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
            </div>
            <select
                class="w-full px-3 py-2 rounded-lg input-field text-white text-sm"
                onchange="updateConversationMessage(${index}, 'voice_id', this.value)"
            >
                <option value="">Select voice...</option>
                ${voices.map(v => `<option value="${v.voice_id}" ${msg.voice_id === v.voice_id ? 'selected' : ''}>${v.name}</option>`).join('')}
            </select>
            <textarea
                class="w-full px-3 py-2 rounded-lg input-field text-white text-sm resize-none"
                rows="2"
                placeholder="What does this speaker say?"
                onchange="updateConversationMessage(${index}, 'text', this.value)"
            >${msg.text}</textarea>
        </div>
    `).join('');

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function updateConversationMessage(index, field, value) {
    if (conversationMessages[index]) {
        conversationMessages[index][field] = value;
    }
}

function removeConversationMessage(index) {
    conversationMessages.splice(index, 1);
    renderConversationMessages();
}

async function generateConversation() {
    const validMessages = conversationMessages.filter(m => m.text && m.voice_id);

    if (validMessages.length === 0) {
        showError('Please add at least one message with text and voice');
        return;
    }

    try {
        // Generate each message sequentially
        for (const msg of validMessages) {
            await fetch(`${API_BASE}/api/tts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: msg.text,
                    voice_id: msg.voice_id
                })
            });
        }

        const resultEl = document.getElementById('conversationResult');
        if (resultEl) {
            resultEl.textContent = `✅ Generated ${validMessages.length} audio segments`;
            resultEl.classList.remove('hidden');
        }

        console.log('✅ Conversation generated');
    } catch (error) {
        console.error('Error generating conversation:', error);
        showError(error.message || 'Failed to generate conversation');
    }
}

// Voice Comparison
async function generateCompare(voiceNum) {
    const text = document.getElementById('compareText')?.value.trim();
    const voiceId = document.getElementById(`compareVoice${voiceNum}`)?.value;

    if (!text) {
        showError('Please enter comparison text');
        return;
    }

    if (!voiceId) {
        showError(`Please select Voice ${voiceNum === 1 ? 'A' : 'B'}`);
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                voice_id: voiceId
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Generation failed');
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);

        const audioElement = document.getElementById(`compareAudio${voiceNum}`);
        audioElement.src = audioUrl;
        audioElement.classList.remove('hidden');

        console.log(`✅ Comparison audio ${voiceNum} generated`);
    } catch (error) {
        console.error('Error generating comparison:', error);
        showError(error.message || 'Failed to generate comparison');
    }
}

// Error/Success Messages
function showError(message) {
    const errorEl = document.getElementById('errorMessage');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');

        setTimeout(() => {
            errorEl.classList.add('hidden');
        }, 5000);
    }
}

function showCloneError(message) {
    const errorEl = document.getElementById('cloneError');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');

        setTimeout(() => {
            errorEl.classList.add('hidden');
        }, 5000);
    }
}

function showCloneSuccess(message) {
    const successEl = document.getElementById('cloneResult');
    const errorEl = document.getElementById('cloneError');

    if (errorEl) errorEl.classList.add('hidden');

    if (successEl) {
        successEl.textContent = message;
        successEl.classList.remove('hidden');

        setTimeout(() => {
            successEl.classList.add('hidden');
        }, 8000);
    }
}

console.log('🎙️ NextEleven - Studio-Quality Voice AI loaded');
