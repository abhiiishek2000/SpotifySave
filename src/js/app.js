const urlInput = document.getElementById('url-input');
const downloadBtn = document.getElementById('download-btn');
const trackInfo = document.getElementById('track-info');
const trackImage = document.getElementById('track-image');
const trackTitle = document.getElementById('track-title');
const trackArtist = document.getElementById('track-artist');
const trackDuration = document.getElementById('track-duration');
const status = document.getElementById('status');
const pasteBtn = document.querySelector('.paste-btn');
const downloadTrack = document.getElementById('download-track');
const progressBar = document.getElementById('progress-bar');
const progressElement = progressBar.querySelector('.progress');
const progressText = progressBar.querySelector('.progress-text');
const spinner = document.getElementById('loading-spinner');

const downloadCounter = new DownloadCounter();

let currentTrackInfo = null;

// Toast configuration
toastr.options = {
    "closeButton": true,
    "positionClass": "toast-top-right",
    "timeOut": "3000"
};

function showError(message) {
    toastr.error(message);
}

function showSuccess(message) {
    toastr.success(message);
}

function showInfo(message) {
    toastr.info(message);
}

//FIREBASE

function updateStatsDisplay(stats) {
    // Update download count
    const downloadCounter = document.getElementById('download-counter');
    if (downloadCounter) {
        downloadCounter.textContent = stats.successCount.toLocaleString();
    }

    // Update success rate
    const successRate = document.getElementById('success-rate');
    if (successRate) {
        successRate.textContent = `${stats.successRate}%`;
    }
}

// Listen for download count updates
downloadCounter.listenToStats(updateStatsDisplay);


// Reset UI function
const resetUI = () => {
    urlInput.value = '';
    trackInfo.style.display = 'none';
    downloadTrack.textContent = 'Download Track';
    downloadTrack.disabled = false;
    progressBar.style.display = 'none';
    status.style.display = 'none';
    status.classList.remove('loading-dots');
};

// Paste button functionality
pasteBtn.addEventListener('click', async () => {
    try {
        const text = await navigator.clipboard.readText();
        urlInput.value = text;
    } catch (err) {
        console.error('Failed to read clipboard:', err);
        showError('Failed to access clipboard');
    }
});

// Download button click handler
downloadBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) {
        showError('Please enter a Spotify URL');
        return;
    }

    if (!url.includes('spotify.com')) {
        showError('Please enter a valid Spotify URL');
        return;
    }

    resetUI();
    spinner.style.display = 'block';
    status.style.display = 'none';
    trackInfo.style.display = 'none';
    downloadBtn.style.display = 'none';

    try {
        showInfo('Fetching track information...');
        const response = await fetch('/track-info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error);

        currentTrackInfo = {
            title: data.title,
            artist: data.artist,
            image: data.image,
            duration: data.duration,
            spotifyUrl: url
        };

        trackImage.src = data.image;
        trackTitle.textContent = data.title;
        trackArtist.textContent = data.artist;
//        trackDuration.textContent = data.duration ?? '';
        trackInfo.style.display = 'block';
        showSuccess('Track found successfully!');
    } catch (error) {
        showError(error.message);
        downloadBtn.style.display = 'block';
    } finally {
        spinner.style.display = 'none';
    }
});

// Download track functionality
downloadTrack.addEventListener('click', async () => {
    if (!currentTrackInfo) {
        showError('No track selected');
        return;
    }

    downloadTrack.style.display = 'none';
    progressBar.style.display = 'block';
    progressElement.style.width = '5%';
    progressText.textContent = window.innerWidth <= 480 ? '0%' : 'Starting...';

    try {
        const response = await fetch('/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: currentTrackInfo.title,
                artist: currentTrackInfo.artist,
                url: currentTrackInfo.spotifyUrl
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Download failed');
        }

        // Stream response handling
        const reader = response.body.getReader();
        const contentLength = response.headers.get('Content-Length');
        const chunks = [];
        let receivedLength = 0;
        let startTime = Date.now();

        while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            chunks.push(value);
            receivedLength += value.length;

            // Calculate speed and progress
            const elapsedSeconds = (Date.now() - startTime) / 1000;
            const bytesPerSecond = receivedLength / elapsedSeconds;
            const speedMbps = (bytesPerSecond / (1024 * 1024)).toFixed(2);

            // Update progress based on screen size
            if (contentLength) {
                const progress = (receivedLength / contentLength) * 100;
                progressElement.style.width = `${progress}%`;

                progressText.textContent = window.innerWidth <= 480
                    ? `${Math.round(progress)}%`
                    : `Downloading... ${Math.round(progress)}% (${speedMbps} MB/s)`;
            } else {
                const downloadedMB = (receivedLength / (1024 * 1024)).toFixed(2);
                progressText.textContent = window.innerWidth <= 480
                    ? `${downloadedMB}MB`
                    : `Downloaded ${downloadedMB}MB (${speedMbps} MB/s)`;
            }
        }

        // Create and trigger download
        const blob = new Blob(chunks, { type: 'audio/mpeg' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `${currentTrackInfo.title} - ${currentTrackInfo.artist}.mp3`;
        document.body.appendChild(a);
        a.click();

        // Cleanup
        setTimeout(() => {
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }, 100);

        progressElement.style.width = '100%';
        progressText.textContent = window.innerWidth <= 480 ? '100%' : 'Download complete!';
         await downloadCounter.logDownload(true, {
            title: currentTrackInfo.title,
            artist: currentTrackInfo.artist,
            url: currentTrackInfo.spotifyUrl
        });
        showSuccess('Download complete!');

        setTimeout(() => {
            progressBar.style.display = 'none';
            downloadTrack.style.display = 'block';
            downloadTrack.textContent = 'Downloaded';
            downloadTrack.disabled = true;
        }, 2000);

    } catch (error) {
     // Log failed download with error
        await downloadCounter.logDownload(false, {
            title: currentTrackInfo.title,
            artist: currentTrackInfo.artist,
            url: currentTrackInfo.spotifyUrl,
            error: error.message
        });
        showError('Download failed: ' + error.message);
        progressBar.style.display = 'none';
        downloadTrack.style.display = 'block';
        downloadTrack.disabled = false;
    }
});

// Handle window resize for responsive progress text
window.addEventListener('resize', () => {
    if (progressText && progressText.textContent) {
        const currentText = progressText.textContent;
        if (currentText.includes('%')) {
            const percentage = currentText.match(/\d+/)[0];
            progressText.textContent = window.innerWidth <= 480
                ? `${percentage}%`
                : `Downloading... ${percentage}%`;
        }
    }
});