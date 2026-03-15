const STATIONS = [
  // 🎧 Chill & Study
  { id: 'jfKfPfyJRdk', name: 'Lofi Girl',        category: 'chill', icon: '🎧' },
  { id: '5yx6BWlEVcY', name: 'Chillhop',         category: 'chill', icon: '🎵' },
  { id: '7NOSDKb0HlU', name: 'Study Beats',      category: 'chill', icon: '📚' },
  { id: 'rPjez8z61rI', name: 'Chill Vibes',      category: 'chill', icon: '🎶' },
  // ☕ Café & Jazz
  { id: 'lP26UCnoH9s', name: 'Coffee Shop',      category: 'cafe',  icon: '☕' },
  { id: 'Dx5qFachd3A', name: 'Jazz Piano',       category: 'cafe',  icon: '🎹' },
  { id: 'ceqgwo7U28Y', name: 'Chill Radio',      category: 'cafe',  icon: '🎷' },
  { id: 'kgx4WGK0oNU', name: 'Jazz Lofi Live',   category: 'cafe',  icon: '🌴' },
  // 🌙 Night & Ambient
  { id: 'rUxyKA_-grg', name: 'Sleep Radio',      category: 'night', icon: '🌙' },
  { id: 'DWcJFNfaw9c', name: 'Night Lofi',       category: 'night', icon: '🏙' },
  { id: '36YnV9STBqc', name: 'Good Life Radio',  category: 'night', icon: '🌿' },
  { id: 'BHACKCNDMW8', name: 'Nature & Chill',   category: 'night', icon: '🌧' },
  // 🚀 Synth & Retro
  { id: 'tNkZsRW7h2c', name: 'Space Ambient',    category: 'synth', icon: '🚀' },
  { id: '4xDzrJKXOOY', name: 'Synthwave',        category: 'synth', icon: '🌆' },
  { id: 'UedTcufyrHc', name: 'ChillSynth FM',    category: 'synth', icon: '🕹' },
];

const CATEGORIES = [
  { key: 'all',   label: 'All',   icon: '📻' },
  { key: 'chill', label: 'Chill', icon: '🎧' },
  { key: 'cafe',  label: 'Café',  icon: '☕' },
  { key: 'night', label: 'Night', icon: '🌙' },
  { key: 'synth', label: 'Synth', icon: '🚀' },
];

const DEAD_CACHE_KEY = 'lofi-dead-stations';
const DEAD_TTL_MS = 60 * 60 * 1000;

class LofiRadioApp {
  constructor() {
    this.state = {
      stationIdx: 0,
      playing: false,
      volume: 30,
      ready: false,
      expanded: false,
      minimized: false,
      filter: 'all',
      deadStations: this.loadDeadStations(),
      stationError: null,
      isMobile: window.innerWidth <= 600
    };
    
    this.skipCount = 0;
    this.player = null;
    this.ytReady = false;
    this.reachedPlaying = false;
    this.playbackTimer = null;
    this.cancelled = false;

    this.initDOM();
    this.ensureEqStyles();
    this.loadYTApi().then(() => {
      this.ytReady = true;
      this.setState({ ready: true });
      this.initPlayer();
    });

    window.addEventListener('resize', () => {
      this.setState({ isMobile: window.innerWidth <= 600 });
    });
  }

  loadDeadStations() {
    try {
      const raw = localStorage.getItem(DEAD_CACHE_KEY);
      if (!raw) return new Set();
      const entries = JSON.parse(raw);
      const now = Date.now();
      const alive = new Set();
      for (const [idxStr, ts] of Object.entries(entries)) {
        if (now - ts < DEAD_TTL_MS) alive.add(Number(idxStr));
      }
      return alive;
    } catch { return new Set(); }
  }

  saveDeadStations(dead) {
    try {
      const raw = localStorage.getItem(DEAD_CACHE_KEY);
      const existing = raw ? JSON.parse(raw) : {};
      const now = Date.now();
      const merged = {};
      for (const idx of dead) {
        merged[String(idx)] = existing[String(idx)] ?? now;
      }
      localStorage.setItem(DEAD_CACHE_KEY, JSON.stringify(merged));
    } catch {}
  }

  clearDeadStation(idx) {
    try {
      const raw = localStorage.getItem(DEAD_CACHE_KEY);
      if (!raw) return;
      const entries = JSON.parse(raw);
      delete entries[String(idx)];
      localStorage.setItem(DEAD_CACHE_KEY, JSON.stringify(entries));
    } catch {}
  }

  setState(newState) {
    this.state = { ...this.state, ...newState };
    this.render();
  }

  initDOM() {
    this.container = document.createElement('div');
    this.container.id = 'lofi-radio-root';
    document.body.appendChild(this.container);
    
    // Mount player div
    this.playerContainer = document.createElement('div');
    this.playerContainer.id = 'lofi-yt-player';
    this.playerContainer.style.position = 'absolute';
    this.playerContainer.style.width = '0';
    this.playerContainer.style.height = '0';
    this.playerContainer.style.overflow = 'hidden';
    document.body.appendChild(this.playerContainer);

    // Event delegation
    this.container.addEventListener('click', (e) => {
      let target = e.target.closest('[data-action]');
      if (!target) return;
      e.stopPropagation();
      const action = target.getAttribute('data-action');
      const val = target.getAttribute('data-value');
      
      switch(action) {
        case 'togglePlay': this.togglePlay(); break;
        case 'toggleExpand': this.setState({ expanded: !this.state.expanded }); break;
        case 'minimize': this.setState({ minimized: true, expanded: false }); break;
        case 'restore': this.setState({ minimized: false }); break;
        case 'nextStation': this.nextStation(); break;
        case 'prevStation': this.prevStation(); break;
        case 'setFilter': this.setState({ filter: val }); break;
        case 'selectStation': this.selectStation(Number(val)); break;
      }
    });

    this.container.addEventListener('input', (e) => {
      let target = e.target.closest('[data-action]');
      if (!target) return;
      const action = target.getAttribute('data-action');
      if (action === 'setVolume') {
        const vol = Number(target.value);
        this.setState({ volume: vol });
        if (this.player && this.player.setVolume) {
          this.player.setVolume(vol);
        }
      }
    });

    this.render();
  }

  ensureEqStyles() {
    if (document.getElementById('lofi-eq-keyframes')) return;
    const style = document.createElement('style');
    style.id = 'lofi-eq-keyframes';
    style.textContent = `
      @keyframes lofi-eq {
        0%   { height: 3px; }
        50%  { height: 100%; }
        100% { height: 4px; }
      }
      .lofi-glass {
        background: rgba(10, 10, 25, 0.88);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        border: 1px solid rgba(0, 255, 255, 0.25);
        box-shadow: 0 4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04);
      }
      .lofi-scroll::-webkit-scrollbar { width: 6px; }
      .lofi-scroll::-webkit-scrollbar-thumb { background-color: rgba(0,255,255,0.3); border-radius: 3px; }
    `;
    document.head.appendChild(style);
  }

  loadYTApi() {
    return new Promise((resolve) => {
      if (window.YT && window.YT.Player) {
        resolve(window.YT);
        return;
      }
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prev) prev();
        if (window.YT) resolve(window.YT);
      };
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
    });
  }

  initPlayer() {
    if (!this.ytReady || !window.YT) return;
    try { if (this.player) this.player.destroy(); } catch {}

    const station = STATIONS[this.state.stationIdx];
    this.cancelled = false;
    this.reachedPlaying = false;
    this.setState({ stationError: null });

    this.player = new window.YT.Player('lofi-yt-player', {
      height: '0',
      width: '0',
      videoId: station.id,
      playerVars: {
        autoplay: this.state.playing ? 1 : 0,
        controls: 0,
        playsinline: 1,
        origin: window.location.origin,
      },
      events: {
        onReady: () => {
          if (this.cancelled) return;
          this.player.setVolume(this.state.volume);
          if (this.state.playing) {
            this.player.playVideo();
            this.startPlaybackTimeout();
          }
        },
        onError: () => this.markDead('Station offline'),
        onStateChange: (e) => {
          if (this.cancelled) return;
          if (e.data === 1) { // PLAYING
            this.reachedPlaying = true;
            if (this.playbackTimer) clearTimeout(this.playbackTimer);
            this.setState({ stationError: null });
            this.skipCount = 0;
          }
          if (e.data === 0 && this.state.playing) { // ENDED
            this.markDead('Stream ended');
          }
          if (e.data === 3 && this.state.playing && !this.reachedPlaying) { // BUFFERING
            this.startPlaybackTimeout();
          }
        }
      }
    });
  }

  startPlaybackTimeout() {
    if (this.playbackTimer) clearTimeout(this.playbackTimer);
    if (!this.state.playing || this.reachedPlaying) return;
    this.playbackTimer = setTimeout(() => {
      if (!this.cancelled && !this.reachedPlaying && this.state.playing) {
        this.markDead('No audio - skipping');
      }
    }, 10000);
  }

  markDead(reason) {
    if (this.cancelled) return;
    const newDead = new Set(this.state.deadStations);
    newDead.add(this.state.stationIdx);
    this.saveDeadStations(newDead);
    this.setState({ deadStations: newDead, stationError: reason });

    this.skipCount++;
    if (this.skipCount < STATIONS.length) {
      setTimeout(() => {
        if (!this.cancelled) this.nextStation();
      }, 1200);
    } else {
      this.setState({ stationError: 'All offline' });
    }
  }

  togglePlay() {
    if (!this.player || !this.player.playVideo) return;
    if (this.state.playing) {
      this.player.pauseVideo();
      this.setState({ playing: false });
    } else {
      this.player.playVideo();
      this.setState({ playing: true });
      this.startPlaybackTimeout();
    }
  }

  nextStation() {
    const nextIdx = (this.state.stationIdx + 1) % STATIONS.length;
    this.changeStation(nextIdx);
  }

  prevStation() {
    const prevIdx = (this.state.stationIdx - 1 + STATIONS.length) % STATIONS.length;
    this.changeStation(prevIdx);
  }

  selectStation(idx) {
    this.changeStation(idx);
    this.setState({ expanded: false });
  }

  changeStation(idx) {
    this.skipCount = 0;
    this.clearDeadStation(idx);
    const newDead = new Set(this.state.deadStations);
    newDead.delete(idx);
    
    this.cancelled = true;
    this.setState({ deadStations: newDead, stationIdx: idx, playing: true });
    
    setTimeout(() => {
      const oldPlayer = document.getElementById('lofi-yt-player');
      if (oldPlayer) {
          const freshDiv = document.createElement('div');
          freshDiv.id = 'lofi-yt-player';
          freshDiv.style.position = 'absolute';
          freshDiv.style.width = '0';
          freshDiv.style.height = '0';
          freshDiv.style.overflow = 'hidden';
          oldPlayer.parentNode.replaceChild(freshDiv, oldPlayer);
      }
      this.initPlayer();
    }, 50);
  }

  render() {
    const { stationIdx, playing, volume, expanded, minimized, filter, deadStations, stationError, isMobile } = this.state;
    const station = STATIONS[stationIdx];
    const filtered = filter === 'all' ? STATIONS : STATIONS.filter(s => s.category === filter);

    const eqBars = (active, size) => {
        const heights = [0.6, 1, 0.4, 0.8];
        return '<div style="display: flex; align-items: flex-end; gap: 1.5px; height: ' + size + 'px;">' +
            heights.map((h, i) => '<div style="width: ' + Math.max(2, size/6) + 'px; border-radius: 1px; background: ' + (active ? '#0ff' : '#555') + '; height: ' + (active ? (size*h)+'px' : '3px') + '; animation: ' + (active ? 'lofi-eq '+(0.6 + i*0.15)+'s ease-in-out '+(i*0.1)+'s infinite alternate' : 'none') + '; transform-origin: bottom; max-height: ' + (size*h) + 'px;"></div>').join('') +
        '</div>';
    };

    const containerStyle = 
      'position: fixed;' +
      'top: ' + (isMobile ? 'auto' : '12px') + ';' +
      'bottom: ' + (isMobile ? '12px' : 'auto') + ';' +
      'right: ' + (isMobile ? 'auto' : '12px') + ';' +
      'left: ' + (isMobile ? (minimized ? '12px' : '50%') : '12px') + ';' +
      'transform: ' + (isMobile && !minimized ? 'translateX(-50%)' : 'none') + ';' +
      'z-index: 10000;' +
      'font-family: \'Share Tech Mono\', monospace;' +
      'font-size: ' + (isMobile ? '10px' : '11px') + ';' +
      'color: #ccc;' +
      'user-select: none;';

    if (minimized) {
        this.container.style.cssText = containerStyle;
        this.container.innerHTML = 
            '<div data-action="restore" class="lofi-glass" style="border-radius: 50%; width: ' + (isMobile ? '36px' : '42px') + '; height: ' + (isMobile ? '36px' : '42px') + '; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: ' + (isMobile ? '16px' : '18px') + '; box-shadow: 0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1); transition: transform 0.2s;" onmouseenter="this.style.transform=\'scale(1.05)\'" onmouseleave="this.style.transform=\'scale(1)\'" title="Restore Radio">📻</div>';
        return;
    }

    const shadow = playing ? 'box-shadow: 0 0 16px rgba(0, 255, 255, 0.15), 0 4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04);' : '';

    const catHtml = CATEGORIES.map(c => {
        const active = filter === c.key;
        return '<div data-action="setFilter" data-value="' + c.key + '" style="padding: 3px 8px; border-radius: 10px; cursor: pointer; font-size: ' + (isMobile?'9px':'10px') + '; background: ' + (active ? 'rgba(0, 255, 255, 0.2)' : 'rgba(255,255,255,0.04)') + '; color: ' + (active ? '#0ff' : '#888') + '; border: 1px solid ' + (active ? 'rgba(0, 255, 255, 0.4)' : 'rgba(255,255,255,0.06)') + '; transition: all 0.2s; font-weight: ' + (active ? 600 : 400) + '; white-space: nowrap;">' + c.icon + ' ' + c.label + '</div>';
    }).join('');

    const statHtml = filtered.map(s => {
        const idx = STATIONS.indexOf(s);
        const isCurrent = idx === stationIdx;
        const isDead = deadStations.has(idx);
        return '<div data-action="selectStation" data-value="' + idx + '" style="display: flex; align-items: center; gap: 8px; padding: 6px 8px; cursor: pointer; border-radius: 6px; background: ' + (isCurrent ? 'rgba(0, 255, 255, 0.12)' : 'transparent') + '; transition: background 0.15s; margin-bottom: 1px; opacity: ' + (isDead ? '0.4' : '1') + ';" ' + (!isCurrent ? 'onmouseenter="this.style.background=\'rgba(255,255,255,0.04)\'" onmouseleave="this.style.background=\'transparent\'"' : '') + '>' +
            '<span style="font-size: 14px; width: 20px; text-align: center; flex-shrink: 0;">' + (isCurrent && playing ? eqBars(true, 12) : s.icon) + '</span>' +
            '<span style="flex: 1; color: ' + (isCurrent ? '#0ff' : '#aaa') + '; font-weight: ' + (isCurrent ? 600 : 400) + '; font-size: ' + (isMobile?'10px':'11px') + '; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + s.name + '</span>' +
            '<span style="font-size: 8px; color: ' + (isDead ? '#f44336' : '#555') + '; text-transform: uppercase; letter-spacing: 0.5px; flex-shrink: 0;">' + (isDead ? 'offline' : s.category) + '</span>' +
        '</div>';
    }).join('');

    this.container.style.cssText = containerStyle;
    this.container.innerHTML = 
        '<div class="lofi-glass" style="display: flex; align-items: center; gap: ' + (isMobile?'5px':'8px') + '; border-radius: 20px; padding: ' + (isMobile?'4px 10px':'5px 14px') + '; transition: box-shadow 0.3s; ' + shadow + '">' +
            '<div data-action="togglePlay" style="width: ' + (isMobile?'26px':'28px') + '; height: ' + (isMobile?'26px':'28px') + '; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: ' + (playing ? 'rgba(0, 255, 255, 0.2)' : 'rgba(255,255,255,0.06)') + '; border: 1px solid ' + (playing ? 'rgba(0, 255, 255, 0.4)' : 'rgba(255,255,255,0.1)') + '; cursor: pointer; transition: all 0.2s; font-size: 13px; flex-shrink: 0;">' +
                (playing ? '⏸' : '▶') +
            '</div>' +
            eqBars(playing, isMobile ? 12 : 14) +
            '<div data-action="toggleExpand" style="cursor: pointer; display: flex; flex-direction: column; min-width: 0; flex: 1;">' +
                '<span style="color: #0ff; font-weight: 600; font-size: ' + (isMobile?'10px':'11px') + '; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: ' + (isMobile?'85px':'130px') + '; line-height: 1.2;">' +
                    station.icon + ' ' + station.name +
                '</span>' +
                '<span style="color: ' + (stationError ? '#f44336' : '#666') + '; font-size: ' + (isMobile?'8px':'9px') + '; text-transform: uppercase; letter-spacing: 0.5px; line-height: 1.2;">' +
                    (stationError ?? station.category) +
                '</span>' +
            '</div>' +
            '<div style="display: flex; gap: 2px; flex-shrink: 0;">' +
                '<span data-action="prevStation" style="cursor: pointer; font-size: 13px; padding: 2px 3px; opacity: 0.6; transition: opacity 0.2s;" onmouseenter="this.style.opacity=\'1\'" onmouseleave="this.style.opacity=\'0.6\'">⏮</span>' +
                '<span data-action="nextStation" style="cursor: pointer; font-size: 13px; padding: 2px 3px; opacity: 0.6; transition: opacity 0.2s;" onmouseenter="this.style.opacity=\'1\'" onmouseleave="this.style.opacity=\'0.6\'">⏭</span>' +
            '</div>' +
            (!isMobile ? '<input type="range" data-action="setVolume" min="0" max="100" value="' + volume + '" style="width: 50px; accent-color: #0ff; cursor: pointer; opacity: 0.7;" title="Volume: ' + volume + '%" />' : '') +
            '<span data-action="minimize" style="cursor: pointer; font-size: 12px; padding: 2px 4px; opacity: 0.5; transition: opacity 0.2s; flex-shrink: 0; margin-left: 2px; display: flex; align-items: center;" onmouseenter="this.style.opacity=\'1\'" onmouseleave="this.style.opacity=\'0.5\'" title="Minimize Radio">_</span>' +
            '<span data-action="toggleExpand" style="cursor: pointer; font-size: 10px; padding: 2px 4px; transition: transform 0.3s; transform: ' + (expanded ? 'rotate(180deg)' : 'rotate(0deg)') + '; display: inline-block; opacity: 0.5; flex-shrink: 0;" title="' + (expanded ? 'Collapse' : 'View Stations') + '">▼</span>' +
        '</div>' +
        '<div class="lofi-glass" style="border-radius: 12px; margin-top: 6px; overflow: hidden; max-height: ' + (expanded ? '400px' : '0') + '; opacity: ' + (expanded ? '1' : '0') + '; transition: max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease; pointer-events: ' + (expanded ? 'auto' : 'none') + ';">' +
            '<div style="display: flex; gap: 4px; padding: 10px 10px 6px; flex-wrap: wrap;">' +
                catHtml +
            '</div>' +
            '<div class="lofi-scroll" style="max-height: 220px; overflow-y: auto; padding: 2px 6px 6px;">' +
                statHtml +
            '</div>' +
            '<div style="display: flex; align-items: center; gap: 8px; padding: 6px 12px 10px; border-top: 1px solid rgba(255,255,255,0.05);">' +
                '<span style="font-size: 12px; opacity: 0.5;">' + (volume === 0 ? '🔇' : (volume < 40 ? '🔈' : (volume < 70 ? '🔉' : '🔊'))) + '</span>' +
                '<input type="range" data-action="setVolume" min="0" max="100" value="' + volume + '" style="flex: 1; accent-color: #0ff; cursor: pointer;" />' +
                '<span style="font-size: 9px; color: #666; min-width: 24px; text-align: right;">' + volume + '%</span>' +
            '</div>' +
        '</div>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new LofiRadioApp();
});
