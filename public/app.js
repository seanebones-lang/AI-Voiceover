// VoiceClone AI - Advanced App Logic
const API_BASE = window.location.origin;

// Global state
let voices = [];
let presets = {};
let currentAudioBlob = null;
let selectedFiles = [];
let conversationMessages = [];
let currentPreset = null;

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
    await loadPresets();
    await loadUserInfo();
    setupEventListeners();
    setupDragAndDrop();
    addInitialConversationMessage();
}

// Event Listeners
function setupEventListeners() {
    const textInput = document.getElementById('textInput');
    const stability = document.getElementById('stability');
    const similarity = document.getElementById('similarity');
    const style = document.getElementById('style');
    const audioFiles = document.getElementById('audioFiles');

    textInput?.addEventListener('input', updateCharCount);
    stability?.addEventListener('input', (e) => updateSliderValue('stabilityValue', e.target.value));
    similarity?.addEventListener('input', (e) => updateSliderValue('similarityValue', e.target.value));
    style?.addEventListener('input', (e) => updateSliderValue('styleValue', e.target.value));
    audioFiles?.addEventListener('change', handleFileSelect);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            const activeTab = document.querySelector('.tab-content.active');
            if (activeTab?.id === 'tab-generator') {
                generateSpeech();
            }
        }
    });
}

// Tab Switching
function switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden');
        tab.classList.remove('block');
    });

    // Remove active state from all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('border-purple-600', 'text-purple-600', 'dark:text-purple-400');
        btn.classList.add('border-transparent', 'text-slate-600', 'dark:text-slate-400');
    });

    // Show selected tab
    const selectedTab = document.getElementById(`tab-${tabName}`);
    if (selectedTab) {
        selectedTab.classList.remove('hidden');
        selectedTab.classList.add('block');
    }

    // Add active state to clicked button
    const clickedBtn = event.target.closest('.tab-btn');
    if (clickedBtn) {
        clickedBtn.classList.remove('border-transparent', 'text-slate-600', 'dark:text-slate-400');
        clickedBtn.classList.add('border-purple-600', 'text-purple-600', 'dark:text-purple-400');
    }

    // Populate voice selects for compare tab
    if (tabName === 'compare') {
        populateCompareVoices();
    }
}

// Load Voices
async function loadVoices() {
    try {
        const response = await fetch(`${API_BASE}/api/voices`);
        if (!response.ok) throw new Error('Failed to load voices');

        const data = await response.json();
        voices = data.voices || [];

        populateVoiceSelect('voiceSelect');
        console.log(`✅ Loaded ${voices.length} voices`);
    } catch (error) {
        console.error('Error loading voices:', error);
        showError('Failed to load voices. Please refresh.');
    }
}

function populateVoiceSelect(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;

    select.innerHTML = '<option value="">-- Select a Voice --</option>';

    // Group voices
    const categories = {};
    voices.forEach(voice => {
        const cat = voice.category || 'Other';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(voice);
    });

    // Add popular first
    const popularVoices = voices.filter(v =>
        v.name.toLowerCase().includes('morgan') ||
        v.name.toLowerCase().includes('david') ||
        v.name.toLowerCase().includes('rachel') ||
        v.name.toLowerCase().includes('adam')
    ).slice(0, 10);

    if (popularVoices.length) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = '⭐ Popular Voices';
        popularVoices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.voice_id;
            option.textContent = `${voice.name}`;
            optgroup.appendChild(option);
        });
        select.appendChild(optgroup);
    }

    // Add by category
    Object.keys(categories).sort().forEach(cat => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = cat.charAt(0).toUpperCase() + cat.slice(1);
        categories[cat].forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.voice_id;
            option.textContent = voice.name;
            optgroup.appendChild(option);
        });
        select.appendChild(optgroup);
    });
}

function populateCompareVoices() {
    populateVoiceSelect('compareVoice1');
    populateVoiceSelect('compareVoice2');
}

// Load Emotion Presets
async function loadPresets() {
    try {
        const response = await fetch(`${API_BASE}/api/presets`);
        if (!response.ok) throw new Error('Failed to load presets');

        presets = await response.json();
        renderPresets();
        console.log('✅ Loaded emotion presets');
    } catch (error) {
        console.error('Error loading presets:', error);
    }
}

function renderPresets() {
    const container = document.getElementById('presetButtons');
    if (!container) return;

    const presetIcons = {
        excited: 'zap',
        calm: 'cloud',
        serious: 'briefcase',
        dramatic: 'theater',
        whisper: 'volume-1',
        angry: 'flame',
        happy: 'smile',
        sad: 'cloud-rain'
    };

    container.innerHTML = Object.keys(presets).map(key => `
        <button class="px-4 py-2 rounded-lg border-2 border-slate-200 dark:border-slate-700 hover:border-purple-400 dark:hover:border-purple-500 transition-all text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 flex items-center justify-center space-x-2" onclick="applyPreset('${key}')" data-preset="${key}">
            <i data-lucide="${presetIcons[key] || 'mic'}" class="w-4 h-4"></i>
            <span>${key.charAt(0).toUpperCase() + key.slice(1)}</span>
        </button>
    `).join('');

    // Reinitialize Lucide icons for dynamically added elements
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function applyPreset(presetName) {
    const preset = presets[presetName];
    if (!preset) return;

    document.getElementById('stability').value = preset.stability;
    document.getElementById('similarity').value = preset.similarity_boost;
    document.getElementById('style').value = preset.style;

    updateSliderValue('stabilityValue', preset.stability);
    updateSliderValue('similarityValue', preset.similarity_boost);
    updateSliderValue('styleValue', preset.style);

    // Visual feedback with Tailwind classes
    document.querySelectorAll('[data-preset]').forEach(btn => {
        btn.classList.remove('bg-purple-600', 'border-purple-600', 'text-white');
        btn.classList.add('border-slate-200', 'dark:border-slate-700', 'text-slate-700', 'dark:text-slate-300');
    });

    const activeBtn = document.querySelector(`[data-preset="${presetName}"]`);
    if (activeBtn) {
        activeBtn.classList.remove('border-slate-200', 'dark:border-slate-700', 'text-slate-700', 'dark:text-slate-300');
        activeBtn.classList.add('bg-purple-600', 'border-purple-600', 'text-white');
    }

    currentPreset = presetName;
    console.log(`✅ Applied ${presetName} preset`);
}

// User Info
async function loadUserInfo() {
    // Show unlimited access - no paywall
    const charCountEl = document.getElementById('characterCount');
    if (charCountEl) {
        charCountEl.innerHTML = `
            <span class="flex items-center space-x-2">
                <span>All Features Unlocked:</span>
                <strong class="text-purple-600 dark:text-purple-400">Unlimited Access</strong>
            </span>
        `;
    }
    console.log('✅ Free unlimited access enabled');
}

// Character Counter
function updateCharCount() {
    const textInput = document.getElementById('textInput');
    const charCount = document.getElementById('charCount');
    if (textInput && charCount) {
        charCount.textContent = textInput.value.length;
    }
}

// Slider Value Update
function updateSliderValue(elementId, value) {
    const elem = document.getElementById(elementId);
    if (elem) {
        elem.textContent = parseFloat(value).toFixed(2);
    }
}

// Advanced Settings Toggle
function toggleAdvanced() {
    const content = document.getElementById('advancedContent');
    const arrow = document.getElementById('advancedArrow');

    if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        arrow.classList.add('rotate-180');
    } else {
        content.classList.add('hidden');
        arrow.classList.remove('rotate-180');
    }
}

// Theme Toggle
function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.classList.contains('dark');

    if (isDark) {
        html.classList.remove('dark');
        localStorage.setItem('theme', 'light');
    } else {
        html.classList.add('dark');
        localStorage.setItem('theme', 'dark');
    }

    // Reinitialize icons after theme change
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Load theme preference on init
(function() {
    const theme = localStorage.getItem('theme');
    if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    }
})();

// Text to Speech Generation
async function generateSpeech() {
    const textInput = document.getElementById('textInput');
    const voiceSelect = document.getElementById('voiceSelect');
    const generateBtn = document.getElementById('generateBtn');
    const btnText = document.getElementById('btnText');

    const text = textInput?.value.trim();
    const voiceId = voiceSelect?.value;

    if (!text) {
        showError('Please enter some text');
        return;
    }

    if (!voiceId) {
        showError('Please select a voice');
        return;
    }

    // Show loading
    generateBtn.disabled = true;
    btnText.textContent = 'Generating...';

    try {
        const stability = document.getElementById('stability').value;
        const similarity = document.getElementById('similarity').value;
        const style = document.getElementById('style').value;

        const response = await fetch(`${API_BASE}/api/text-to-speech`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                voice_id: voiceId,
                stability: parseFloat(stability),
                similarity_boost: parseFloat(similarity),
                style: parseFloat(style)
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
        audioCard.classList.add('block');

        const errorMsg = document.getElementById('errorMessage');
        errorMsg.classList.add('hidden');
        errorMsg.classList.remove('block');

        // Update user info
        loadUserInfo();

        console.log('✅ Audio generated successfully');
    } catch (error) {
        console.error('Error generating speech:', error);
        showError(error.message || 'Failed to generate speech');
    } finally {
        generateBtn.disabled = false;
        btnText.textContent = 'Generate Voice-Over';
    }
}

// Audio Actions
function clearAudio() {
    const audioCard = document.getElementById('audioPlayerCard');
    audioCard.classList.add('hidden');
    audioCard.classList.remove('block');

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
    a.download = `voiceover-${Date.now()}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('✅ Audio downloaded');
}

function shareAudio() {
    const text = 'Check out this AI voice I just created with VoiceClone AI! 🎙️';
    const url = window.location.href;

    if (navigator.share) {
        navigator.share({
            title: 'VoiceClone AI',
            text: text,
            url: url
        }).then(() => {
            console.log('✅ Shared successfully');
        }).catch(err => {
            console.log('Share cancelled');
        });
    } else {
        // Fallback: Twitter share
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
        window.open(twitterUrl, '_blank');
    }
}

// Voice Cloning
function setupDragAndDrop() {
    const uploadZone = document.getElementById('uploadZone');
    if (!uploadZone) return;

    uploadZone.addEventListener('click', () => {
        document.getElementById('audioFiles').click();
    });

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('drag-over');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('drag-over');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('drag-over');

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

    fileList.innerHTML = selectedFiles.map((file, index) => {
        const isRecording = file.name.includes('voice-recording');
        const icon = isRecording ? 'mic' : 'file-audio';
        return `
            <div class="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <div class="flex items-center space-x-3 flex-1">
                    <i data-lucide="${icon}" class="w-4 h-4 text-purple-600 dark:text-purple-400 flex-shrink-0"></i>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">${file.name}</p>
                        <p class="text-xs text-slate-500 dark:text-slate-400">${formatFileSize(file.size)}</p>
                    </div>
                </div>
                <button
                    onclick="removeFile(${index})"
                    class="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex-shrink-0"
                    title="Remove file"
                >
                    <i data-lucide="x" class="w-4 h-4 text-slate-600 dark:text-slate-400"></i>
                </button>
            </div>
        `;
    }).join('');

    // Reinitialize Lucide icons
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

// ========== Voice Recording Functions ==========

async function toggleRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        stopRecording();
    } else {
        await startRecording();
    }
}

async function startRecording() {
    try {
        // Request microphone access
        recordingStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        // Create media recorder
        const options = { mimeType: 'audio/webm' };
        mediaRecorder = new MediaRecorder(recordingStream, options);
        audioChunks = [];

        // Handle data available
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        // Handle recording stop
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            recordedAudioBlob = audioBlob;
            displayRecordedAudio(audioBlob);
        };

        // Start recording
        mediaRecorder.start();
        recordingStartTime = Date.now();

        // Update UI
        updateRecordingUI(true);

        // Start timer
        startRecordingTimer();

        console.log('✅ Recording started');
    } catch (error) {
        console.error('Error starting recording:', error);
        if (error.name === 'NotAllowedError') {
            alert('Microphone access denied. Please allow microphone access to record your voice.');
        } else {
            alert('Failed to start recording. Please check your microphone.');
        }
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();

        // Stop all tracks
        if (recordingStream) {
            recordingStream.getTracks().forEach(track => track.stop());
        }

        // Stop timer
        stopRecordingTimer();

        // Update UI
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
    const recordingTimer = document.getElementById('recordingTimer');
    const recordingControls = document.getElementById('recordingControls');
    const recordingPulse = document.getElementById('recordingPulse');

    if (isRecording) {
        // Change mic button to red
        micButton.classList.remove('bg-gradient-to-br', 'from-purple-500', 'to-indigo-500', 'hover:from-purple-600', 'hover:to-indigo-600');
        micButton.classList.add('bg-red-600', 'hover:bg-red-700');

        // Show recording pulse
        recordingPulse.classList.remove('hidden');

        // Update status
        recordingStatus.innerHTML = '<span class="flex items-center space-x-2"><span class="w-2 h-2 bg-red-600 rounded-full animate-pulse"></span><span>Recording...</span></span>';

        // Show timer and controls
        recordingTimer.classList.remove('hidden');
        recordingControls.classList.remove('hidden');
    } else {
        // Change mic button back to purple
        micButton.classList.remove('bg-red-600', 'hover:bg-red-700');
        micButton.classList.add('bg-gradient-to-br', 'from-purple-500', 'to-indigo-500', 'hover:from-purple-600', 'hover:to-indigo-600');

        // Hide recording pulse
        recordingPulse.classList.add('hidden');

        // Update status
        recordingStatus.textContent = 'Click microphone to start recording';

        // Hide timer and controls
        recordingTimer.classList.add('hidden');
        recordingControls.classList.add('hidden');
    }

    // Reinitialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function displayRecordedAudio(audioBlob) {
    const container = document.getElementById('recordedAudioContainer');
    const audioElement = document.getElementById('recordedAudio');
    const durationElement = document.getElementById('recordedDuration');

    if (!container || !audioElement) return;

    // Create URL for audio
    const audioUrl = URL.createObjectURL(audioBlob);
    audioElement.src = audioUrl;

    // Show container
    container.classList.remove('hidden');

    // Update duration when loaded
    audioElement.addEventListener('loadedmetadata', () => {
        const duration = Math.floor(audioElement.duration);
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        durationElement.textContent = `Duration: ${minutes}:${seconds.toString().padStart(2, '0')}`;
    }, { once: true });

    // Reinitialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    console.log('✅ Recorded audio ready for playback');
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

    console.log('✅ Recording deleted');
}

function addRecordingToFiles() {
    if (!recordedAudioBlob) {
        alert('No recording to add');
        return;
    }

    // Create a File object from the blob
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `voice-recording-${timestamp}.webm`;
    const file = new File([recordedAudioBlob], fileName, { type: 'audio/webm' });

    // Add to selected files
    if (selectedFiles.length >= 5) {
        showCloneError('Maximum 5 files allowed. Remove a file before adding recording.');
        return;
    }

    selectedFiles.push(file);
    renderFileList();

    // Clear the recording
    deleteRecording();

    // Show success message
    const status = document.getElementById('recordingStatus');
    if (status) {
        status.innerHTML = '<span class="text-green-600 dark:text-green-400 font-semibold">✓ Recording added to voice samples!</span>';
        setTimeout(() => {
            status.textContent = 'Click microphone to start recording';
        }, 3000);
    }

    console.log('✅ Recording added to files:', fileName);
}

// ========== End Voice Recording Functions ==========

async function cloneVoice() {
    const name = document.getElementById('cloneName')?.value.trim();
    const description = document.getElementById('cloneDescription')?.value.trim();

    if (!name) {
        showCloneError('Please enter a voice name');
        return;
    }

    if (selectedFiles.length === 0) {
        showCloneError('Please upload at least one audio file');
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

        selectedFiles.forEach(file => {
            formData.append('files', file);
        });

        const response = await fetch(`${API_BASE}/api/clone-voice`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to clone voice');
        }

        showCloneSuccess(`Voice "${name}" cloned successfully! Voice ID: ${data.voice_id}`);

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

// Multi-Voice Conversation
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
        <div class="conversation-message">
            <div class="conversation-message-header">
                <input
                    type="text"
                    class="input-modern"
                    placeholder="Speaker name (e.g., John)"
                    value="${msg.speaker}"
                    onchange="updateConversationMessage(${index}, 'speaker', this.value)"
                >
                <button class="btn-remove" onclick="removeConversationMessage(${index})">✕</button>
            </div>
            <div class="form-section">
                <select
                    class="input-modern"
                    onchange="updateConversationMessage(${index}, 'voice_id', this.value)"
                >
                    <option value="">Select voice...</option>
                    ${voices.map(v => `<option value="${v.voice_id}" ${msg.voice_id === v.voice_id ? 'selected' : ''}>${v.name}</option>`).join('')}
                </select>
            </div>
            <div class="form-section">
                <textarea
                    class="input-modern textarea-modern"
                    rows="3"
                    placeholder="What does ${msg.speaker || 'this speaker'} say?"
                    onchange="updateConversationMessage(${index}, 'text', this.value)"
                >${msg.text}</textarea>
            </div>
        </div>
    `).join('');
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
        const response = await fetch(`${API_BASE}/api/conversation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: validMessages.map(m => ({
                    text: m.text,
                    voice_id: m.voice_id,
                    speaker_name: m.speaker || 'Speaker'
                }))
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to generate conversation');
        }

        document.getElementById('conversationResult').style.display = 'block';
        document.getElementById('conversationResult').textContent =
            `✅ ${data.message} Generated ${data.count} audio segments.`;

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
        const response = await fetch(`${API_BASE}/api/text-to-speech`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                voice_id: voiceId,
                stability: 0.5,
                similarity_boost: 0.85,
                style: 0.3
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
        audioElement.classList.add('block');

        console.log(`✅ Comparison audio ${voiceNum} generated`);
    } catch (error) {
        console.error('Error generating comparison:', error);
        showError(error.message || 'Failed to generate comparison audio');
    }
}

// Error Handling
function showError(message) {
    const errorEl = document.getElementById('errorMessage');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
        errorEl.classList.add('block');

        setTimeout(() => {
            errorEl.classList.add('hidden');
            errorEl.classList.remove('block');
        }, 5000);
    }
}

function showCloneError(message) {
    const errorEl = document.getElementById('cloneError');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
        errorEl.classList.add('block');

        setTimeout(() => {
            errorEl.classList.add('hidden');
            errorEl.classList.remove('block');
        }, 5000);
    }
}

function showCloneSuccess(message) {
    const successEl = document.getElementById('cloneResult');
    const errorEl = document.getElementById('cloneError');

    if (errorEl) {
        errorEl.classList.add('hidden');
        errorEl.classList.remove('block');
    }

    if (successEl) {
        successEl.textContent = message;
        successEl.classList.remove('hidden');
        successEl.classList.add('block');

        setTimeout(() => {
            successEl.classList.add('hidden');
            successEl.classList.remove('block');
        }, 8000);
    }
}

// Utility Functions
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Stripe Checkout
// Checkout disabled - all features are free for now
async function startCheckout(plan) {
    alert('All features are currently free! Just start using the app - no payment required.');
    console.log('Checkout disabled - plan:', plan);
}

console.log('🎙️ VoiceClone AI initialized successfully');
