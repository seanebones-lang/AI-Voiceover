// VoiceClone AI - Advanced App Logic
const API_BASE = window.location.origin;

// Global state
let voices = [];
let browserVoices = [];
let allVoices = []; // Combined ElevenLabs + Browser voices
let presets = {};
let currentAudioBlob = null;
let selectedFiles = [];
let conversationMessages = [];
let currentPreset = null;
let isOnline = navigator.onLine;
let favoriteVoices = JSON.parse(localStorage.getItem('favoriteVoices') || '[]');
let audioHistory = JSON.parse(localStorage.getItem('audioHistory') || '[]');
let voiceSearchTerm = '';
let voiceFilters = { gender: 'all', language: 'all', source: 'all' };

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
    // Load browser voices first (instant, offline)
    await loadBrowserVoices();

    // Then load ElevenLabs voices (requires internet)
    await loadVoices();

    await loadPresets();
    await loadUserInfo();
    setupEventListeners();
    setupDragAndDrop();
    addInitialConversationMessage();
    setupOnlineOfflineDetection();
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

// Load Browser Voices (Offline, Free)
async function loadBrowserVoices() {
    return new Promise((resolve) => {
        if (!('speechSynthesis' in window)) {
            console.warn('⚠️ Web Speech API not supported in this browser');
            browserVoices = [];
            resolve();
            return;
        }

        const loadVoicesList = () => {
            const systemVoices = speechSynthesis.getVoices();

            browserVoices = systemVoices.map(voice => ({
                voice_id: `browser_${voice.name.replace(/\s+/g, '_')}`,
                name: `${voice.name} (Offline)`,
                category: 'browser',
                source: 'browser',
                lang: voice.lang,
                localService: voice.localService,
                default: voice.default,
                nativeVoice: voice // Store reference to native voice object
            }));

            console.log(`✅ Loaded ${browserVoices.length} browser voices (offline)`);

            // Combine with ElevenLabs voices
            combineVoices();
            resolve();
        };

        // Chrome loads voices asynchronously
        if (speechSynthesis.getVoices().length > 0) {
            loadVoicesList();
        } else {
            speechSynthesis.addEventListener('voiceschanged', loadVoicesList, { once: true });
            // Timeout fallback
            setTimeout(() => {
                if (browserVoices.length === 0) {
                    loadVoicesList();
                }
            }, 1000);
        }
    });
}

// Load ElevenLabs Voices (Online, Premium)
async function loadVoices() {
    try {
        if (!navigator.onLine) {
            console.log('📴 Offline mode - using browser voices only');
            voices = [];
            combineVoices();
            return;
        }

        const response = await fetch(`${API_BASE}/api/voices`);
        if (!response.ok) throw new Error('Failed to load voices');

        const data = await response.json();
        voices = data.voices || [];

        // Mark as ElevenLabs voices
        voices.forEach(v => {
            v.source = 'elevenlabs';
            v.category = v.category || 'premium';
        });

        combineVoices();
        console.log(`✅ Loaded ${voices.length} ElevenLabs voices (online)`);
    } catch (error) {
        console.error('Error loading ElevenLabs voices:', error);
        console.log('ℹ️ Using browser voices only');
        voices = [];
        combineVoices();
    }
}

// Combine all voice sources
function combineVoices() {
    allVoices = [...browserVoices, ...voices];
    populateVoiceSelect('voiceSelect');
    console.log(`✅ Total voices available: ${allVoices.length}`);
}

function populateVoiceSelect(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;

    select.innerHTML = '<option value="">-- Select a Voice --</option>';

    // Filter voices based on search and filters
    const filteredBrowser = filterVoices(browserVoices);
    const filteredPremium = filterVoices(voices);

    // Favorites first (if any)
    const favoriteList = [...filteredBrowser, ...filteredPremium].filter(v =>
        favoriteVoices.includes(v.voice_id)
    );

    if (favoriteList.length > 0) {
        const favGroup = document.createElement('optgroup');
        favGroup.label = '⭐ Your Favorites';
        favoriteList.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.voice_id;
            option.textContent = `${voice.name} ★`;
            option.dataset.source = voice.source;
            favGroup.appendChild(option);
        });
        select.appendChild(favGroup);
    }

    // Browser voices (offline, free)
    if (filteredBrowser.length > 0) {
        const browserGroup = document.createElement('optgroup');
        browserGroup.label = `🌐 Browser Voices (${filteredBrowser.length} available)`;

        // Group by language
        const byLang = {};
        filteredBrowser.forEach(v => {
            const lang = v.lang.split('-')[0].toUpperCase();
            if (!byLang[lang]) byLang[lang] = [];
            byLang[lang].push(v);
        });

        // Add English voices first
        if (byLang.EN) {
            byLang.EN.forEach(voice => {
                const option = document.createElement('option');
                option.value = voice.voice_id;
                const star = favoriteVoices.includes(voice.voice_id) ? ' ★' : '';
                option.textContent = voice.name + star;
                option.dataset.source = 'browser';
                browserGroup.appendChild(option);
            });
        }

        // Then other languages
        Object.keys(byLang).sort().forEach(lang => {
            if (lang === 'EN') return; // Already added
            byLang[lang].forEach(voice => {
                const option = document.createElement('option');
                option.value = voice.voice_id;
                const star = favoriteVoices.includes(voice.voice_id) ? ' ★' : '';
                option.textContent = `${voice.name} [${lang}]${star}`;
                option.dataset.source = 'browser';
                browserGroup.appendChild(option);
            });
        });

        select.appendChild(browserGroup);
    }

    // ElevenLabs voices (premium, online)
    if (filteredPremium.length > 0) {
        // Group voices
        const categories = {};
        filteredPremium.forEach(voice => {
            const cat = voice.category || 'Other';
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(voice);
        });

        // Add popular first
        const popularVoices = filteredPremium.filter(v =>
            v.name.toLowerCase().includes('morgan') ||
            v.name.toLowerCase().includes('david') ||
            v.name.toLowerCase().includes('rachel') ||
            v.name.toLowerCase().includes('adam')
        ).slice(0, 10);

        if (popularVoices.length) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = '⭐ Popular Premium Voices (ElevenLabs)';
            popularVoices.forEach(voice => {
                const option = document.createElement('option');
                option.value = voice.voice_id;
                const star = favoriteVoices.includes(voice.voice_id) ? ' ★' : '';
                option.textContent = `${voice.name} (Premium)${star}`;
                option.dataset.source = 'elevenlabs';
                optgroup.appendChild(option);
            });
            select.appendChild(optgroup);
        }

        // Add by category
        Object.keys(categories).sort().forEach(cat => {
            const optgroup = document.createElement('optgroup');
            optgroup.label = `${cat.charAt(0).toUpperCase() + cat.slice(1)} (Premium - ${categories[cat].length})`;
            categories[cat].forEach(voice => {
                const option = document.createElement('option');
                option.value = voice.voice_id;
                const star = favoriteVoices.includes(voice.voice_id) ? ' ★' : '';
                option.textContent = voice.name + star;
                option.dataset.source = 'elevenlabs';
                optgroup.appendChild(option);
            });
            select.appendChild(optgroup);
        });
    }

    // Show offline indicator if no internet
    if (!navigator.onLine && browserVoices.length > 0) {
        const offlineMsg = document.createElement('option');
        offlineMsg.disabled = true;
        offlineMsg.textContent = '📴 Offline Mode - Premium voices unavailable';
        select.insertBefore(offlineMsg, select.firstChild.nextSibling);
    }

    // Show no results message
    if (filteredBrowser.length === 0 && filteredPremium.length === 0 && (voiceSearchTerm || voiceFilters.gender !== 'all' || voiceFilters.language !== 'all')) {
        const noResults = document.createElement('option');
        noResults.disabled = true;
        noResults.textContent = '🔍 No voices found - try different filters';
        select.appendChild(noResults);
    }
}

// Filter voices based on search and filters
function filterVoices(voiceList) {
    return voiceList.filter(voice => {
        // Search filter
        if (voiceSearchTerm) {
            const searchLower = voiceSearchTerm.toLowerCase();
            const matchesName = voice.name.toLowerCase().includes(searchLower);
            const matchesLang = voice.lang && voice.lang.toLowerCase().includes(searchLower);
            if (!matchesName && !matchesLang) return false;
        }

        // Source filter
        if (voiceFilters.source !== 'all') {
            if (voiceFilters.source !== voice.source) return false;
        }

        // Language filter
        if (voiceFilters.language !== 'all') {
            if (!voice.lang || !voice.lang.toLowerCase().startsWith(voiceFilters.language)) return false;
        }

        // Gender filter (only for ElevenLabs voices with labels)
        if (voiceFilters.gender !== 'all' && voice.labels) {
            if (voice.labels.gender !== voiceFilters.gender) return false;
        }

        return true;
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

// Enhanced preset system with ALL voice controls
const enhancedPresets = {
    excited: {
        stability: 0.3,
        similarity_boost: 0.75,
        style: 0.8,
        pitch: 1.2,  // Higher pitch
        rate: 1.3,   // Faster
        volume: 1.0,
        emphasis: 'strong',
        description: 'High energy and enthusiastic - faster, higher pitch'
    },
    calm: {
        stability: 0.7,
        similarity_boost: 0.85,
        style: 0.2,
        pitch: 0.9,  // Slightly lower
        rate: 0.85,  // Slower
        volume: 0.9,
        emphasis: 'reduced',
        description: 'Relaxed and soothing - slower, lower pitch'
    },
    serious: {
        stability: 0.8,
        similarity_boost: 0.9,
        style: 0.1,
        pitch: 0.85, // Lower pitch
        rate: 0.9,   // Slightly slower
        volume: 1.0,
        emphasis: 'moderate',
        description: 'Professional and formal - measured pace'
    },
    dramatic: {
        stability: 0.4,
        similarity_boost: 0.8,
        style: 0.9,
        pitch: 1.0,
        rate: 0.8,   // Slower for emphasis
        volume: 1.0,
        emphasis: 'strong',
        description: 'Theatrical and expressive - varied pace, dramatic pauses'
    },
    whisper: {
        stability: 0.5,
        similarity_boost: 0.95,
        style: 0.5,
        pitch: 0.95,
        rate: 0.8,   // Slower
        volume: 0.6, // Quieter
        emphasis: 'reduced',
        description: 'Soft and intimate - quiet, slow'
    },
    angry: {
        stability: 0.3,
        similarity_boost: 0.7,
        style: 0.9,
        pitch: 1.1,  // Slightly higher
        rate: 1.2,   // Faster
        volume: 1.0,
        emphasis: 'strong',
        description: 'Intense and forceful - louder, faster'
    },
    happy: {
        stability: 0.4,
        similarity_boost: 0.8,
        style: 0.7,
        pitch: 1.15, // Higher
        rate: 1.1,   // Slightly faster
        volume: 1.0,
        emphasis: 'moderate',
        description: 'Cheerful and upbeat - bright, energetic'
    },
    sad: {
        stability: 0.6,
        similarity_boost: 0.85,
        style: 0.4,
        pitch: 0.85, // Lower
        rate: 0.75,  // Slower
        volume: 0.85,
        emphasis: 'reduced',
        description: 'Melancholic and slow - quiet, drawn out'
    },
    robotic: {
        stability: 0.9,
        similarity_boost: 0.95,
        style: 0.0,
        pitch: 1.0,
        rate: 1.0,
        volume: 1.0,
        emphasis: 'none',
        description: 'Monotone and mechanical - no variation'
    },
    storyteller: {
        stability: 0.5,
        similarity_boost: 0.85,
        style: 0.6,
        pitch: 0.95,
        rate: 0.9,   // Slightly slower for clarity
        volume: 1.0,
        emphasis: 'moderate',
        description: 'Narrative style - clear, engaging pace'
    }
};

function applyPreset(presetName) {
    const preset = enhancedPresets[presetName] || presets[presetName];
    if (!preset) return;

    // Apply ElevenLabs settings
    document.getElementById('stability').value = preset.stability;
    document.getElementById('similarity').value = preset.similarity_boost;
    document.getElementById('style').value = preset.style;

    updateSliderValue('stabilityValue', preset.stability);
    updateSliderValue('similarityValue', preset.similarity_boost);
    updateSliderValue('styleValue', preset.style);

    // Apply enhanced controls if they exist
    if (preset.pitch !== undefined) {
        const pitchSlider = document.getElementById('pitchControl');
        if (pitchSlider) {
            pitchSlider.value = preset.pitch;
            updateSliderValue('pitchValue', preset.pitch);
        }
    }

    if (preset.rate !== undefined) {
        const rateSlider = document.getElementById('rateControl');
        if (rateSlider) {
            rateSlider.value = preset.rate;
            updateSliderValue('rateValue', preset.rate);
        }
    }

    if (preset.volume !== undefined) {
        const volumeSlider = document.getElementById('volumeControl');
        if (volumeSlider) {
            volumeSlider.value = preset.volume;
            updateSliderValue('volumeValue', preset.volume);
        }
    }

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
    console.log(`✅ Applied ${presetName} preset with enhanced controls:`, preset);
}

// Online/Offline Detection
function setupOnlineOfflineDetection() {
    window.addEventListener('online', () => {
        isOnline = true;
        console.log('🌐 Online - Premium voices available');
        loadVoices(); // Reload ElevenLabs voices
        updateOnlineStatus();
    });

    window.addEventListener('offline', () => {
        isOnline = false;
        console.log('📴 Offline - Browser voices only');
        updateOnlineStatus();
    });

    updateOnlineStatus();
}

function updateOnlineStatus() {
    const charCountEl = document.getElementById('characterCount');
    if (!charCountEl) return;

    const status = isOnline ? 'Online' : 'Offline';
    const icon = isOnline ? '🌐' : '📴';
    const color = isOnline ? 'green' : 'orange';

    charCountEl.innerHTML = `
        <span class="flex items-center space-x-2">
            <span>${icon} Status: <strong class="text-${color}-600 dark:text-${color}-400">${status}</strong></span>
            ${isOnline ?
                '<span class="text-sm text-slate-500">• ElevenLabs + Browser Voices</span>' :
                '<span class="text-sm text-slate-500">• Browser Voices Only (FREE)</span>'
            }
        </span>
    `;
}

// User Info
async function loadUserInfo() {
    updateOnlineStatus();
    console.log('✅ Voice system initialized');
}

// Character Counter + Reading Time
function updateCharCount() {
    const textInput = document.getElementById('textInput');
    const charCount = document.getElementById('charCount');
    if (textInput && charCount) {
        const length = textInput.value.length;
        const words = textInput.value.trim().split(/\s+/).filter(w => w.length > 0).length;
        const readingTimeSeconds = Math.ceil(words / 2.5); // ~150 words per minute = 2.5 words/sec
        const minutes = Math.floor(readingTimeSeconds / 60);
        const seconds = readingTimeSeconds % 60;

        let timeStr = '';
        if (minutes > 0) {
            timeStr = `${minutes}m ${seconds}s`;
        } else {
            timeStr = `${seconds}s`;
        }

        charCount.textContent = `${length} chars • ${words} words • ~${timeStr} audio`;
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

    // Check if it's a browser voice (offline)
    const isBrowserVoice = voiceId.startsWith('browser_');

    if (isBrowserVoice) {
        return generateSpeechBrowser(text, voiceId, generateBtn, btnText);
    } else {
        return generateSpeechElevenLabs(text, voiceId, generateBtn, btnText);
    }
}

// Browser TTS (100% Offline, No API needed)
async function generateSpeechBrowser(text, voiceId, generateBtn, btnText) {
    generateBtn.disabled = true;
    btnText.textContent = 'Generating (Offline)...';

    try {
        if (!('speechSynthesis' in window)) {
            throw new Error('Browser TTS not supported. Please use Chrome, Firefox, or Edge.');
        }

        // Find the browser voice
        const browserVoice = browserVoices.find(v => v.voice_id === voiceId);
        if (!browserVoice) {
            throw new Error('Voice not found');
        }

        console.log('🌐 Generating with browser voice (offline):', browserVoice.name);

        // Cancel any ongoing speech
        speechSynthesis.cancel();

        // Create utterance
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = browserVoice.nativeVoice;

        // Apply FULL control settings
        const pitchControl = document.getElementById('pitchControl');
        const rateControl = document.getElementById('rateControl');
        const volumeControl = document.getElementById('volumeControl');

        // Use enhanced controls if available, otherwise fall back to basic controls
        utterance.pitch = pitchControl ? parseFloat(pitchControl.value) : 1.0;
        utterance.rate = rateControl ? parseFloat(rateControl.value) : 1.0;
        utterance.volume = volumeControl ? parseFloat(volumeControl.value) : 1.0;

        console.log(`🎚️  Voice settings: pitch=${utterance.pitch}, rate=${utterance.rate}, volume=${utterance.volume}`);

        // Create audio recording from speech synthesis
        const chunks = [];
        let mediaRecorder;

        // Use MediaRecorder to capture the audio
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const dest = audioContext.createMediaStreamDestination();

        return new Promise((resolve, reject) => {
            utterance.onstart = () => {
                console.log('🎙️ Browser TTS started');
            };

            utterance.onend = async () => {
                console.log('✅ Browser TTS completed');

                try {
                    // For browser voices, we'll play directly without recording for now
                    // Show success message
                    const audioCard = document.getElementById('audioPlayerCard');
                    const audioElement = document.getElementById('audioElement');

                    // Create a simple notification that it played
                    showError('✅ Audio played successfully! (Browser voices play directly, download not available)', 'success');

                    audioCard.classList.add('hidden');

                    generateBtn.disabled = false;
                    btnText.textContent = 'Generate Voice-Over';
                    resolve();
                } catch (err) {
                    reject(err);
                }
            };

            utterance.onerror = (event) => {
                console.error('❌ Browser TTS error:', event);
                reject(new Error(`TTS Error: ${event.error}`));
                generateBtn.disabled = false;
                btnText.textContent = 'Generate Voice-Over';
            };

            // Speak it
            speechSynthesis.speak(utterance);
        });

    } catch (error) {
        console.error('Error generating browser speech:', error);
        showError(error.message || 'Failed to generate speech with browser voice');
        generateBtn.disabled = false;
        btnText.textContent = 'Generate Voice-Over';
    }
}

// ElevenLabs TTS (Premium, Online)
async function generateSpeechElevenLabs(text, voiceId, generateBtn, btnText) {
    generateBtn.disabled = true;
    btnText.textContent = 'Generating (Premium)...';

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

        console.log('✅ Audio generated successfully (ElevenLabs)');
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

    console.log('🎤 Starting voice clone with:', { name, fileCount: selectedFiles.length });

    if (!name) {
        showCloneError('Please enter a voice name');
        return;
    }

    if (selectedFiles.length === 0) {
        showCloneError('Please upload at least one audio file or record your voice');
        return;
    }

    // Validate audio files
    const totalSize = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    console.log(`📊 Total audio size: ${totalSizeMB} MB`);

    if (totalSize > 50 * 1024 * 1024) {
        showCloneError(`Total file size (${totalSizeMB} MB) exceeds 50 MB limit`);
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

        selectedFiles.forEach((file, index) => {
            console.log(`📎 Adding file ${index + 1}:`, file.name, `(${(file.size / 1024).toFixed(1)} KB)`);
            formData.append('files', file);
        });

        console.log('📤 Sending voice clone request to server...');

        const response = await fetch(`${API_BASE}/api/clone-voice`, {
            method: 'POST',
            body: formData
        });

        console.log('📥 Response status:', response.status);

        let data;
        try {
            data = await response.json();
        } catch (parseError) {
            console.error('Failed to parse response:', parseError);
            throw new Error('Server returned invalid response');
        }

        if (!response.ok) {
            console.error('❌ Clone failed:', data);
            throw new Error(data.error || `Server error: ${response.status}`);
        }

        console.log('✅ Voice cloned successfully:', data);
        showCloneSuccess(`🎉 Voice "${name}" cloned successfully!\n\nVoice ID: ${data.voice_id}\n\nYou can now use this voice in the "Text to Speech" tab.`);

        // Clear form
        document.getElementById('cloneName').value = '';
        document.getElementById('cloneDescription').value = '';
        selectedFiles = [];
        renderFileList();

        // Reload voices to include the new one
        console.log('🔄 Reloading voice list...');
        await loadVoices();

        // Switch to generator tab and auto-select the new voice
        setTimeout(() => {
            const voiceSelect = document.getElementById('voiceSelect');
            if (voiceSelect && data.voice_id) {
                voiceSelect.value = data.voice_id;
                console.log('✅ Auto-selected cloned voice');
            }
        }, 1000);

        console.log('✅ Voice clone complete:', data.voice_id);
    } catch (error) {
        console.error('❌ Error cloning voice:', error);
        showCloneError(error.message || 'Failed to clone voice. Please check the console for details.');
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

// ========== NEW FEATURES ==========

// Favorites Management
function toggleFavorite(voiceId) {
    const index = favoriteVoices.indexOf(voiceId);
    if (index > -1) {
        favoriteVoices.splice(index, 1);
        console.log('❌ Removed from favorites:', voiceId);
    } else {
        favoriteVoices.push(voiceId);
        console.log('⭐ Added to favorites:', voiceId);
    }
    localStorage.setItem('favoriteVoices', JSON.stringify(favoriteVoices));
    populateVoiceSelect('voiceSelect');
}

function isFavorite(voiceId) {
    return favoriteVoices.includes(voiceId);
}

// Voice Preview
async function previewVoice() {
    const voiceSelect = document.getElementById('voiceSelect');
    const voiceId = voiceSelect?.value;

    if (!voiceId) {
        showError('Please select a voice first');
        return;
    }

    const sampleText = "Hello! This is a preview of this voice. I hope you like how it sounds!";

    // Find the voice
    const voice = [...browserVoices, ...voices].find(v => v.voice_id === voiceId);
    const isBrowserVoice = voiceId.startsWith('browser_');

    if (isBrowserVoice) {
        // Browser voice preview
        if (!('speechSynthesis' in window)) {
            showError('Browser TTS not supported');
            return;
        }

        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(sampleText);
        utterance.voice = voice.nativeVoice;
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        speechSynthesis.speak(utterance);
        console.log('🎙️ Preview playing (browser voice)');
    } else {
        // ElevenLabs voice preview
        try {
            const response = await fetch(`${API_BASE}/api/text-to-speech`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: sampleText,
                    voice_id: voiceId,
                    stability: 0.5,
                    similarity_boost: 0.85,
                    style: 0.3
                })
            });

            if (!response.ok) throw new Error('Preview failed');

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            audio.play();
            console.log('🎙️ Preview playing (ElevenLabs voice)');
        } catch (error) {
            console.error('Preview error:', error);
            showError('Preview failed');
        }
    }
}

// Voice Search
function searchVoices(searchTerm) {
    voiceSearchTerm = searchTerm;
    populateVoiceSelect('voiceSelect');
}

function filterVoicesByOption(filterType, value) {
    voiceFilters[filterType] = value;
    populateVoiceSelect('voiceSelect');
}

function clearVoiceFilters() {
    voiceSearchTerm = '';
    voiceFilters = { gender: 'all', language: 'all', source: 'all' };
    const searchInput = document.getElementById('voiceSearch');
    if (searchInput) searchInput.value = '';
    populateVoiceSelect('voiceSelect');
}

// Audio History
function saveToHistory(text, voiceId, voiceName, audioBlob) {
    const historyItem = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        voiceId,
        voiceName,
        // audioBlob can't be stored in localStorage, would need IndexedDB
        charCount: text.length
    };

    audioHistory.unshift(historyItem);
    if (audioHistory.length > 50) audioHistory.pop(); // Keep last 50
    localStorage.setItem('audioHistory', JSON.stringify(audioHistory));
    console.log('💾 Saved to history:', historyItem.id);
}

function clearHistory() {
    if (confirm('Clear all audio history?')) {
        audioHistory = [];
        localStorage.setItem('audioHistory', JSON.stringify(audioHistory));
        renderHistory();
        console.log('🗑️  History cleared');
    }
}

function renderHistory() {
    // TODO: Add history UI panel
    console.log('History items:', audioHistory.length);
}

// Keyboard Shortcuts
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + Enter: Generate speech
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            const activeTab = document.querySelector('.tab-content:not(.hidden)');
            if (activeTab?.id === 'tab-generator') {
                generateSpeech();
            }
        }

        // Ctrl/Cmd + P: Preview voice
        if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
            e.preventDefault();
            previewVoice();
        }

        // Ctrl/Cmd + F: Focus search
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            const searchInput = document.getElementById('voiceSearch');
            if (searchInput) searchInput.focus();
        }

        // Ctrl/Cmd + S: Toggle favorite
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            const voiceSelect = document.getElementById('voiceSelect');
            if (voiceSelect && voiceSelect.value) {
                toggleFavorite(voiceSelect.value);
            }
        }

        // Esc: Clear audio / Cancel
        if (e.key === 'Escape') {
            speechSynthesis.cancel();
            clearAudio();
        }
    });

    console.log('⌨️  Keyboard shortcuts enabled');
}

// Playback Speed Control
function setPlaybackSpeed(speed) {
    const audioElement = document.getElementById('audioElement');
    if (audioElement && audioElement.src) {
        audioElement.playbackRate = speed;
        console.log(`⚡ Playback speed: ${speed}x`);
    }
}

// Show keyboard shortcuts guide
function showShortcutsGuide() {
    alert(`Keyboard Shortcuts:

⌨️ Ctrl/Cmd + Enter: Generate voice-over
⌨️ Ctrl/Cmd + P: Preview selected voice
⌨️ Ctrl/Cmd + F: Search voices
⌨️ Ctrl/Cmd + S: Toggle favorite (current voice)
⌨️ Esc: Stop playback / Clear

Tip: Use these shortcuts to work faster!`);
}

// Initialize keyboard shortcuts
setupKeyboardShortcuts();

console.log('🎙️ VoiceClone AI initialized successfully');
