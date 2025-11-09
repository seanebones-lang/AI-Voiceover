// API Base URL
const API_BASE = window.location.origin;

// Global state
let voices = [];
let currentAudioBlob = null;
let history = JSON.parse(localStorage.getItem('voiceHistory') || '[]');

// Initialize app on load
document.addEventListener('DOMContentLoaded', () => {
    loadVoices();
    loadUserInfo();
    setupEventListeners();
    renderHistory();
});

// Setup event listeners
function setupEventListeners() {
    const textInput = document.getElementById('textInput');
    const stability = document.getElementById('stability');
    const similarity = document.getElementById('similarity');
    const style = document.getElementById('style');

    textInput.addEventListener('input', updateCharCount);
    stability.addEventListener('input', (e) => updateSliderValue('stabilityValue', e.target.value));
    similarity.addEventListener('input', (e) => updateSliderValue('similarityValue', e.target.value));
    style.addEventListener('input', (e) => updateSliderValue('styleValue', e.target.value));
}

// Update character count
function updateCharCount() {
    const textInput = document.getElementById('textInput');
    const charCount = document.getElementById('charCount');
    charCount.textContent = textInput.value.length;
}

// Update slider value display
function updateSliderValue(elementId, value) {
    document.getElementById(elementId).textContent = value;
}

// Toggle advanced settings
function toggleAdvanced() {
    const content = document.getElementById('advancedContent');
    content.classList.toggle('active');
}

// Load available voices
async function loadVoices() {
    try {
        const response = await fetch(`${API_BASE}/api/voices`);
        if (!response.ok) throw new Error('Failed to fetch voices');

        const data = await response.json();
        voices = data.voices || [];

        const voiceSelect = document.getElementById('voiceSelect');
        voiceSelect.innerHTML = '<option value="">-- Select a Voice --</option>';

        // Group voices by category
        const voicesByCategory = {};
        voices.forEach(voice => {
            const category = voice.category || 'Other';
            if (!voicesByCategory[category]) {
                voicesByCategory[category] = [];
            }
            voicesByCategory[category].push(voice);
        });

        // Add popular voices first
        const popularVoices = voices.filter(v =>
            v.name.includes('Morgan') ||
            v.name.includes('David') ||
            v.name.includes('Freeman') ||
            v.name.includes('Attenborough')
        );

        if (popularVoices.length > 0) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = '⭐ Popular Voices';
            popularVoices.forEach(voice => {
                const option = document.createElement('option');
                option.value = voice.voice_id;
                option.textContent = `${voice.name} (${voice.labels?.accent || 'Generic'})`;
                optgroup.appendChild(option);
            });
            voiceSelect.appendChild(optgroup);
        }

        // Add all voices by category
        Object.keys(voicesByCategory).sort().forEach(category => {
            const optgroup = document.createElement('optgroup');
            optgroup.label = category;
            voicesByCategory[category].forEach(voice => {
                const option = document.createElement('option');
                option.value = voice.voice_id;
                const accent = voice.labels?.accent || '';
                const age = voice.labels?.age || '';
                const description = [accent, age].filter(Boolean).join(', ') || 'Generic';
                option.textContent = `${voice.name} (${description})`;
                optgroup.appendChild(option);
            });
            voiceSelect.appendChild(optgroup);
        });

        console.log(`✅ Loaded ${voices.length} voices`);
    } catch (error) {
        console.error('Error loading voices:', error);
        showError('Failed to load voices. Please refresh the page.');
    }
}

// Load user info (character count, etc.)
async function loadUserInfo() {
    try {
        const response = await fetch(`${API_BASE}/api/user`);
        if (!response.ok) throw new Error('Failed to fetch user info');

        const data = await response.json();
        const characterCount = data.subscription?.character_count || 0;
        const characterLimit = data.subscription?.character_limit || 10000;

        document.getElementById('userInfo').innerHTML = `
            <span>Characters used: <strong>${characterCount.toLocaleString()}</strong> / ${characterLimit.toLocaleString()}</span>
        `;

        console.log('✅ User info loaded:', data);
    } catch (error) {
        console.error('Error loading user info:', error);
        document.getElementById('userInfo').innerHTML = '<span>Character count: Loading...</span>';
    }
}

// Generate speech
async function generateSpeech() {
    const textInput = document.getElementById('textInput');
    const voiceSelect = document.getElementById('voiceSelect');
    const generateBtn = document.getElementById('generateBtn');
    const btnText = document.getElementById('btnText');
    const audioPlayer = document.getElementById('audioPlayer');
    const errorMessage = document.getElementById('errorMessage');

    // Validation
    const text = textInput.value.trim();
    const voiceId = voiceSelect.value;

    if (!text) {
        showError('Please enter some text to convert to speech.');
        return;
    }

    if (!voiceId) {
        showError('Please select a voice.');
        return;
    }

    if (text.length > 5000) {
        showError('Text is too long. Maximum 5,000 characters.');
        return;
    }

    // Hide previous audio and errors
    audioPlayer.style.display = 'none';
    errorMessage.style.display = 'none';

    // Show loading state
    generateBtn.disabled = true;
    btnText.textContent = '🎙️ Generating';
    btnText.classList.add('loading');

    try {
        const stability = document.getElementById('stability').value;
        const similarity = document.getElementById('similarity').value;
        const style = document.getElementById('style').value;

        const response = await fetch(`${API_BASE}/api/text-to-speech`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
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
            throw new Error(error.error || 'Failed to generate speech');
        }

        const audioBlob = await response.blob();
        currentAudioBlob = audioBlob;

        // Create audio URL
        const audioUrl = URL.createObjectURL(audioBlob);
        const audioElement = document.getElementById('audioElement');
        audioElement.src = audioUrl;

        // Show audio player
        audioPlayer.style.display = 'block';

        // Add to history
        const voiceName = voiceSelect.options[voiceSelect.selectedIndex].text;
        addToHistory({
            text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
            voice: voiceName,
            timestamp: new Date().toISOString(),
            audioUrl
        });

        // Update user info
        loadUserInfo();

        console.log('✅ Speech generated successfully');
    } catch (error) {
        console.error('Error generating speech:', error);
        showError(error.message || 'Failed to generate speech. Please try again.');
    } finally {
        // Reset button state
        generateBtn.disabled = false;
        btnText.textContent = '✨ Generate Voice-Over';
        btnText.classList.remove('loading');
    }
}

// Download audio
function downloadAudio() {
    if (!currentAudioBlob) {
        showError('No audio to download.');
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

// Share audio
function shareAudio() {
    const audioElement = document.getElementById('audioElement');
    const audioUrl = audioElement.src;

    if (!audioUrl) {
        showError('No audio to share.');
        return;
    }

    // Copy URL to clipboard
    const tempInput = document.createElement('input');
    tempInput.value = audioUrl;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);

    // Show success message
    alert('Audio URL copied to clipboard! 🎉\n\nShare it on Twitter, Reddit, or anywhere!');

    // Optional: Open Twitter share
    const text = encodeURIComponent('Check out this AI voice-over I just made! 🎙️');
    const twitterUrl = `https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(window.location.origin)}`;

    if (confirm('Want to share on Twitter?')) {
        window.open(twitterUrl, '_blank');
    }

    console.log('✅ Audio URL copied to clipboard');
}

// Add to history
function addToHistory(item) {
    history.unshift(item);

    // Keep only last 10 items
    if (history.length > 10) {
        history = history.slice(0, 10);
    }

    // Save to localStorage
    localStorage.setItem('voiceHistory', JSON.stringify(history));

    renderHistory();
}

// Render history
function renderHistory() {
    const historyList = document.getElementById('historyList');

    if (history.length === 0) {
        historyList.innerHTML = '<p class="empty-state">No voice-overs generated yet. Create your first one above!</p>';
        return;
    }

    historyList.innerHTML = history.map((item, index) => `
        <div class="history-item">
            <div class="history-item-info">
                <h4>${item.voice}</h4>
                <p>${item.text}</p>
                <small>${new Date(item.timestamp).toLocaleString()}</small>
            </div>
            <div class="history-item-actions">
                <button onclick="playHistoryItem(${index})" style="background: var(--primary); color: white;">▶️ Play</button>
                <button onclick="deleteHistoryItem(${index})" style="background: var(--danger); color: white;">🗑️ Delete</button>
            </div>
        </div>
    `).join('');
}

// Play history item
function playHistoryItem(index) {
    const item = history[index];
    if (item && item.audioUrl) {
        const audioElement = document.getElementById('audioElement');
        audioElement.src = item.audioUrl;
        audioElement.play();

        // Scroll to audio player
        document.getElementById('audioPlayer').scrollIntoView({ behavior: 'smooth' });
    }
}

// Delete history item
function deleteHistoryItem(index) {
    if (confirm('Delete this voice-over from history?')) {
        history.splice(index, 1);
        localStorage.setItem('voiceHistory', JSON.stringify(history));
        renderHistory();
    }
}

// Show error message
function showError(message) {
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';

    // Auto-hide after 5 seconds
    setTimeout(() => {
        errorMessage.style.display = 'none';
    }, 5000);
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter to generate
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        generateSpeech();
    }
});

console.log('🎙️ VoiceClone AI loaded successfully');
