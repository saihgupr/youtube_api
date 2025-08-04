document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded and parsed');

    const CHANNEL_ID_INPUT = document.getElementById('channelId');
    const CHANNEL_NAME_INPUT = document.getElementById('channelName');
    const SEARCH_CHANNEL_BTN = document.getElementById('searchChannelBtn');

    SEARCH_CHANNEL_BTN.addEventListener('click', async () => {
        const apiKey = YOUTUBE_API_KEY;
        const channelName = CHANNEL_NAME_INPUT.value;

        if (!apiKey || !channelName) {
            displayMessage('Please enter both an API key and a channel name.', 'error');
            return;
        }

        LOADING_DIV.style.display = 'block';
        CHANNEL_ID_INPUT.value = ''; // Clear previous channel ID

        try {
            const searchApiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(channelName)}&type=channel&key=${apiKey}`;
            const searchResponse = await fetch(searchApiUrl);
            const searchData = await searchResponse.json();

            if (searchData.items && searchData.items.length > 0) {
                const channelId = searchData.items[0].id.channelId;
                CHANNEL_ID_INPUT.value = channelId;
                displayMessage(`Found channel: ${searchData.items[0].snippet.title} (ID: ${channelId})`);
            } else {
                displayMessage('No channel found with that name.', 'error');
            }
        } catch (error) {
            console.error('Error searching for channel:', error);
            displayMessage(`Error searching for channel: ${error.message}`, 'error');
        } finally {
            LOADING_DIV.style.display = 'none';
        }
    });
    const ORDER_SELECT = document.getElementById('order');
    const KEYWORD_FILTER_INPUT = document.getElementById('keywordFilter');
    const MIN_DURATION_INPUT = document.getElementById('minDuration');
    const GET_VIDEOS_BTN = document.getElementById('getVideosBtn');
    const VIDEO_IDS_TEXTAREA = document.getElementById('videoIds');
    const LOADING_DIV = document.getElementById('loading');
    const YOUTUBE_SHORTS_TOGGLE = document.getElementById('youtubeShortsToggle');
    const MESSAGE_AREA = document.getElementById('messageArea');

    function displayMessage(message, type = 'success') {
        MESSAGE_AREA.textContent = message;
        MESSAGE_AREA.className = `message-area show ${type}`;
        setTimeout(() => {
            MESSAGE_AREA.classList.remove('show');
        }, 3000); // Message fades out after 3 seconds
    }

    if (!GET_VIDEOS_BTN) {
        console.error('Could not find the "Get Video IDs" button.');
        return;
    }

    GET_VIDEOS_BTN.addEventListener('click', async () => {
        console.log('Get Videos button clicked.');

        const apiKey = YOUTUBE_API_KEY;
        const channelId = CHANNEL_ID_INPUT.value;
        const order = ORDER_SELECT.value;
        const includeShorts = YOUTUBE_SHORTS_TOGGLE.checked; // Get the state of the toggle
        const keyword = KEYWORD_FILTER_INPUT.value.toLowerCase(); // Get the keyword and convert to lowercase
        const minDurationMinutes = parseFloat(MIN_DURATION_INPUT.value); // Get minimum duration in minutes

        if (!apiKey || !channelId) {
            displayMessage('Please enter both an API key and a channel ID.', 'error');
            console.warn('API Key or Channel ID is missing.');
            return;
        }

        console.log('API Key and Channel ID found. Starting fetch...');
        LOADING_DIV.style.display = 'block';
        VIDEO_IDS_TEXTAREA.value = '';

        try {
            // 1. Get the uploads playlist ID from the channel ID
            const channelApiUrl = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${apiKey}`;
            console.log('Fetching channel data from:', channelApiUrl);
            const channelResponse = await fetch(channelApiUrl);
            const channelData = await channelResponse.json();
            console.log('Channel data received:', channelData);

            if (!channelData.items || channelData.items.length === 0) {
                throw new Error('Could not find channel. Check the Channel ID and API Key.');
            }

            const uploadsPlaylistId = channelData.items[0].contentDetails.relatedPlaylists.uploads;
            console.log('Uploads Playlist ID:', uploadsPlaylistId);

            // 2. Fetch all video IDs from the uploads playlist
            let allVideoIds = [];
            let nextPageToken = '';

            while (true) {
                const playlistApiUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId}&maxResults=50&pageToken=${nextPageToken}&key=${apiKey}`;
                console.log('Fetching playlist page from:', playlistApiUrl);
                const playlistResponse = await fetch(playlistApiUrl);
                const playlistData = await playlistResponse.json();
                console.log('Playlist data received:', playlistData);

                if (!playlistData.items) {
                    throw new Error('Error fetching playlist items. Check API key permissions.');
                }

                const videoIds = playlistData.items.map(item => item.contentDetails.videoId);
                allVideoIds.push(...videoIds);

                nextPageToken = playlistData.nextPageToken;
                if (!nextPageToken) {
                    console.log('All pages fetched.');
                    break;
                }
                console.log('Next page token:', nextPageToken);
            }

            // 3. Fetch video details to filter by duration (or not, based on toggle) and get snippet
            console.log('Fetching video details for duration filtering and snippet...');
            let finalVideos = []; // Store full video objects now
            for (let i = 0; i < allVideoIds.length; i += 50) {
                const videoIdChunk = allVideoIds.slice(i, i + 50);
                const videoDetailsApiUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${videoIdChunk.join(',')}&key=${apiKey}`;
                console.log('Fetching video details from:', videoDetailsApiUrl);
                const videoDetailsResponse = await fetch(videoDetailsApiUrl);
                const videoDetailsData = await videoDetailsResponse.json();
                console.log('Video details received:', videoDetailsData);

                const videosToProcess = videoDetailsData.items.filter(item => {
                    const duration = item.contentDetails.duration;
                    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
                    const hours = (parseInt(match[1]) || 0);
                    const minutes = (parseInt(match[2]) || 0);
                    const seconds = (parseInt(match[3]) || 0);
                    const totalSeconds = hours * 3600 + minutes * 60 + seconds;

                    const isShort = totalSeconds <= 60; // YouTube Shorts are typically 60 seconds or less

                    // Apply YouTube Shorts filter
                    if (!includeShorts && isShort) {
                        return false; // Exclude shorts if toggle is off
                    }

                    // Apply minimum duration filter
                    if (!isNaN(minDurationMinutes) && totalSeconds < (minDurationMinutes * 60)) {
                        return false; // Exclude if shorter than minDuration
                    }

                    return true;
                });

                finalVideos.push(...videosToProcess);
            }

            // Apply keyword filter if provided
            let filteredByKeywordVideos = finalVideos;
            if (keyword) {
                filteredByKeywordVideos = finalVideos.filter(video => {
                    const title = video.snippet.title.toLowerCase();
                    const description = video.snippet.description.toLowerCase();
                    return title.includes(keyword) || description.includes(keyword);
                });
            }

            // 4. Sort the video IDs if requested
            if (order === 'date_asc') {
                console.log('Sorting videos oldest to newest.');
                filteredByKeywordVideos.reverse();
            } else if (order === 'random') {
                console.log('Shuffling videos randomly.');
                for (let i = filteredByKeywordVideos.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [filteredByKeywordVideos[i], filteredByKeywordVideos[j]] = [filteredByKeywordVideos[j], filteredByKeywordVideos[i]];
                }
            } else if (order === 'year_in_title_asc') {
                console.log('Sorting videos by year in title (oldest to newest).');
                filteredByKeywordVideos.sort((a, b) => {
                    const yearA = getYearFromTitle(a.snippet.title);
                    const yearB = getYearFromTitle(b.snippet.title);
                    return yearA - yearB;
                });
            } else if (order === 'year_in_title_desc') {
                console.log('Sorting videos by year in title (newest to oldest).');
                filteredByKeywordVideos.sort((a, b) => {
                    const yearA = getYearFromTitle(a.snippet.title);
                    const yearB = getYearFromTitle(b.snippet.title);
                    return yearB - yearA;
                });
            }

            console.log('Total videos found:', filteredByKeywordVideos.length);

            // Limit to 50 videos for display and URL
            const videosToDisplay = filteredByKeywordVideos.slice(0, 50);

            VIDEO_IDS_TEXTAREA.value = videosToDisplay.map(video => video.id).join(',');

        } catch (error) {
            console.error('An error occurred during the fetch process:', error);
            displayMessage(`An error occurred: ${error.message}`, 'error');
        } finally {
            console.log('Process finished.');
            LOADING_DIV.style.display = 'none';
        }
    });

    const COPY_IOS_URL_BTN = document.getElementById('copyIosUrlBtn');
    const COPY_DESKTOP_URL_BTN = document.getElementById('copyDesktopUrlBtn');

    function getYearFromTitle(title) {
        const match = title.match(/\b(19|20)\d{2}\b/);
        return match ? parseInt(match[0], 10) : Infinity; // Return Infinity if no year found
    }

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            displayMessage('URL copied to clipboard!');
        } catch (err) {
            displayMessage('Failed to copy URL. Please copy manually.', 'error');
        }
    }

    COPY_IOS_URL_BTN.addEventListener('click', () => {
        const videoIds = VIDEO_IDS_TEXTAREA.value;
        if (videoIds) {
            const iosUrl = `https://www.youtube.com/watch_videos?video_ids=${videoIds}`;
            copyToClipboard(iosUrl);
        } else {
            displayMessage('No video IDs to copy.', 'error');
        }
    });

    COPY_DESKTOP_URL_BTN.addEventListener('click', () => {
        const videoIds = VIDEO_IDS_TEXTAREA.value;
        if (videoIds) {
            const desktopUrl = `https://www.youtube.com/watch_videos?video_ids=${videoIds}`;
            window.open(desktopUrl, '_blank');
        } else {
            displayMessage('No video IDs to open.', 'error');
        }
    });
});