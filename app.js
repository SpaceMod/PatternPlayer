/*
 * Copyright (c) 2026 Gareth Bennett (SpaceMod)
 * Licensed under the MIT License. 
 * See LICENSE file in the project root for full license information.
 *
 * version: 1.0
 * last update: 05/02/2026
 */


document.addEventListener('DOMContentLoaded', () => {
    // OPTIMIZATION: Cached DOM Elements
    const DOM = {
        stepGroupsSelect: document.getElementById('step-groups'),
        timeSignatureSelect: document.getElementById('time-signature-select'),
        patternContainer: document.getElementById('pattern-container'),
        metronomeContainer: document.getElementById('metronome-container'),
        playPauseBtn: document.getElementById('play-pause-btn'),
        exportBtn: document.getElementById('export-btn'),
        openBtn: document.getElementById('open-btn'),
        fileInput: document.getElementById('file-input'),
        tempoSlider: document.getElementById('tempo-slider'),
        tempoDisplay: document.getElementById('tempo-display'),
        combinationsCountSpan: document.getElementById('combinations-count'),
        midiToggle: document.getElementById('midi-output-toggle'),
        midiOutputSelect: document.getElementById('midi-output-select'),
        noteSelect: document.getElementById('note-select'),
        octaveSelect: document.getElementById('octave-select'),
        synthSelect: document.getElementById('synth-select'),
        themeToggle: document.getElementById('theme-toggle')
    };

    // Theme
    DOM.themeToggle.onclick = () => document.body.classList.toggle('light-mode');

    // State
    const STATE = {
        numSquaresPerGroup: 16, numGroups: 1, totalNumPatternSquares: 0,
        isPlaying: false, currentStepIndex: 0,
        midiAccess: null, midiOutput: null, activeSynth: null,
        patternState: [], notesPerStep: [], rowSemToneTranspositions: [], rowNotePools: [],
        timeSignature: '4/4', subdivisionSize: 4, metronomeInterval: 4,
        patternSquares: [], metronomeSquares: [],
        chromaticNotes: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
        MIDI_NOTE_ON: 0x90, MIDI_NOTE_OFF: 0x80, MIDI_VELOCITY: 100, MIDI_DURATION_MS: 100
    };

    const NOTE_POOLS = {
        'single_note': { name: 'Single', intervals: [0] },
        'major_triad': { name: 'Major', intervals: [0, 4, 7] },
        'minor_triad': { name: 'Minor', intervals: [0, 3, 7] },
        'augmented_triad': { name: 'Aug', intervals: [0, 4, 8] },
        'diminished_triad': { name: 'Dim', intervals: [0, 3, 6] },
        'sus4': { name: 'Sus4', intervals: [0, 5, 7] },
        'sus2': { name: 'Sus2', intervals: [0, 2, 7] },
        'major_7th': { name: 'Maj 7th', intervals: [0, 4, 7, 11] },
        'minor_7th': { name: 'Min 7th', intervals: [0, 3, 7, 10] },
        'dom_7th': { name: 'Dom 7th', intervals: [0, 4, 7, 10] },
        'm7b5': { name: 'm7b5', intervals: [0, 3, 6, 10] },
        'maj_9th': { name: 'Maj 9th', intervals: [0, 4, 7, 11, 14] },
        'min_9th': { name: 'Min 9th', intervals: [0, 3, 7, 10, 14] },
        'dom_13th': { name: 'Dom 13th', intervals: [0, 4, 7, 10, 14, 21] },
        'root_5th': { name: 'Root+5', intervals: [0, 7] },
        'octave_jump': { name: 'Octaves', intervals: [0, 12] },
        '4_chromatic': { name: 'Random', intervals: null, isChromatic: true },
    };

    const SYNTHS = {
        short: new Tone.Synth({ oscillator: { type: "square" }, envelope: { attack: 0.005, decay: 0.0005, sustain: 0.01, release: 0.1 }}).toDestination(),
        sawtooth: new Tone.Synth({ oscillator: { type: "sawtooth" }, envelope: { attack: 0.005, decay: 0.5, sustain: 0.2, release: 0.5 }}).toDestination(),
        square: new Tone.Synth({ oscillator: { type: "square" }, envelope: { attack: 0.005, decay: 0.5, sustain: 0.2, release: 0.5 }}).toDestination(),
        pulse: new Tone.Synth({ oscillator: { type: "pulse" }, envelope: { attack: 0.005, decay: 0.5, sustain: 0.2, release: 0.5 }}).toDestination(),
        metronome: new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.05 }}).toDestination()  
    };

    function getTransposeDisplay(s) { return s > 0 ? `+${s}` : s.toString(); }

    DOM.patternContainer.addEventListener('click', (e) => {
        const pad = e.target.closest('.pad');
        if (pad) {
            const idx = parseInt(pad.dataset.index);
            STATE.patternState[idx] = !STATE.patternState[idx];
            pad.classList.toggle('is-on', STATE.patternState[idx]);
            if (STATE.patternState[idx] && !STATE.notesPerStep[idx]) generateNotesForStep(idx);
            updateCount();
        }
    });

    function createPatternSquares() {
        DOM.patternContainer.innerHTML = '';
        const prevTotal = STATE.totalNumPatternSquares;
        STATE.totalNumPatternSquares = STATE.numGroups * STATE.numSquaresPerGroup;

        const prevP = [...STATE.patternState], prevN = [...STATE.notesPerStep];
        const prevT = [...STATE.rowSemToneTranspositions], prevPool = [...STATE.rowNotePools];

        STATE.patternState = Array(STATE.totalNumPatternSquares).fill(false);
        STATE.notesPerStep = Array(STATE.totalNumPatternSquares).fill('');
        STATE.rowSemToneTranspositions = Array(STATE.numGroups).fill(0);
        STATE.rowNotePools = Array(STATE.numGroups).fill('single_note');

        for(let i=0; i<Math.min(STATE.totalNumPatternSquares, prevTotal); i++) {
            STATE.patternState[i] = prevP[i]; STATE.notesPerStep[i] = prevN[i];
        }
        for(let g=0; g<Math.min(STATE.numGroups, prevT.length); g++) {
            STATE.rowSemToneTranspositions[g] = prevT[g]; STATE.rowNotePools[g] = prevPool[g];
        }

        STATE.patternSquares = [];

        for (let g = 0; g < STATE.numGroups; g++) {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'track-row';

            const left = document.createElement('div');
            left.className = 'controls-left';
            const tDisp = document.createElement('span');
            tDisp.id = `transpose-display-${g}`;
            tDisp.className = "text-xs font-mono font-bold w-6 text-center";
            tDisp.style.color = 'var(--accent)';
            tDisp.textContent = getTransposeDisplay(STATE.rowSemToneTranspositions[g]);
            
            const btnM = document.createElement('button'); btnM.textContent='-'; btnM.className='btn-mini'; btnM.onclick=()=>handleTranspose(g,-1);
            const btnP = document.createElement('button'); btnP.textContent='+'; btnP.className='btn-mini'; btnP.onclick=()=>handleTranspose(g,1);
            left.append(btnM, tDisp, btnP);

            const scrollPort = document.createElement('div');
            scrollPort.className = 'grid-scroll-port';
            const grid = document.createElement('div');
            grid.className = 'step-grid';

            for (let i = 0; i < STATE.numSquaresPerGroup; i++) {
                const idx = (g * STATE.numSquaresPerGroup) + i;
                const pad = document.createElement('div');
                pad.className = `pad ${STATE.patternState[idx] ? 'is-on' : ''}`;
                if(i>0 && (i+1)%STATE.subdivisionSize===0 && i!==STATE.numSquaresPerGroup-1) pad.classList.add('beat-marker');
                pad.dataset.index = idx;
                
                STATE.patternSquares.push(pad);
                grid.appendChild(pad);
            }
            scrollPort.appendChild(grid);

            const right = document.createElement('div');
            right.className = 'controls-right gap-2';
            const sel = document.createElement('select');
            for(const [k, v] of Object.entries(NOTE_POOLS)) {
                const opt=document.createElement('option'); opt.value=k; opt.textContent=v.name; sel.append(opt);
            }
            sel.value = STATE.rowNotePools[g];
            sel.onchange = (e) => { STATE.rowNotePools[g] = e.target.value; generateNotesForRow(g); };

            const rnd = document.createElement('button'); rnd.textContent="RND"; rnd.className="btn-mini w-auto px-2";
            rnd.style.color='var(--accent)'; rnd.style.background='rgba(45,212,191,0.1)';
            rnd.onclick = () => randomizeRow(g);
            right.append(sel, rnd);

            rowDiv.append(left, scrollPort, right);
            DOM.patternContainer.appendChild(rowDiv);

            if(g >= prevT.length || !STATE.notesPerStep[g * STATE.numSquaresPerGroup]) generateNotesForRow(g);
        }
        updateCount();
    }

    function createMetronome() {
        DOM.metronomeContainer.innerHTML = ''; STATE.metronomeSquares = [];
        for(let i=0; i<STATE.numSquaresPerGroup; i++){
            const d = document.createElement('div');
            d.className = `metro-dot ${i%STATE.metronomeInterval===0?'beat':''}`;
            STATE.metronomeSquares.push(d); DOM.metronomeContainer.appendChild(d);
        }
    }

    function handleTranspose(g, d) {
        let v = Math.max(-12, Math.min(12, STATE.rowSemToneTranspositions[g] + d));
        let delta = v - STATE.rowSemToneTranspositions[g];
        STATE.rowSemToneTranspositions[g] = v;
        document.getElementById(`transpose-display-${g}`).textContent = getTransposeDisplay(v);
        for(let i=g*STATE.numSquaresPerGroup; i<(g+1)*STATE.numSquaresPerGroup; i++){
            if(!STATE.notesPerStep[i]) continue;
            try { STATE.notesPerStep[i] = Tone.Midi(Tone.Midi(STATE.notesPerStep[i]).toMidi() + delta).toNote(); }
            catch(e){ generateNotesForStep(i); }
        }
    }

    function randomizeRow(g) {
        for(let i=g*STATE.numSquaresPerGroup; i<(g+1)*STATE.numSquaresPerGroup; i++){
            let on = Math.random() < 0.35;
            STATE.patternState[i] = on;
            STATE.patternSquares[i].classList.toggle('is-on', on);
        }
        generateNotesForRow(g); updateCount();
    }

    function generateNotesForStep(idx) {
        const g = Math.floor(idx / STATE.numSquaresPerGroup);
        const pool = NOTE_POOLS[STATE.rowNotePools[g]];
        const root = Tone.Midi(DOM.noteSelect.value + DOM.octaveSelect.value).toMidi();
        let n;
        if(pool.isChromatic) {
            n = Tone.Midi([...STATE.chromaticNotes].sort(()=>0.5-Math.random())[0] + DOM.octaveSelect.value).toMidi();
        } else {
            n = root + pool.intervals[Math.floor(Math.random()*pool.intervals.length)];
        }
        n += STATE.rowSemToneTranspositions[g];
        STATE.notesPerStep[idx] = Tone.Midi(Math.min(Math.max(n,12),127)).toNote();
    }

    function generateNotesForRow(g) { for(let i=g*STATE.numSquaresPerGroup; i<(g+1)*STATE.numSquaresPerGroup; i++) generateNotesForStep(i); }
    function generateAll() { for(let g=0; g<STATE.numGroups; g++) generateNotesForRow(g); }

    function handlePlayback(time) {
        const idx = STATE.currentStepIndex;
        const sq = STATE.patternSquares[idx];
        
        if(STATE.patternState[idx]) {
            if(STATE.midiOutput && DOM.midiToggle.checked) {
                const m = Tone.Midi(STATE.notesPerStep[idx]).toMidi();
                STATE.midiOutput.send([STATE.MIDI_NOTE_ON, m, STATE.MIDI_VELOCITY], time * 1000);
                setTimeout(() => STATE.midiOutput.send([STATE.MIDI_NOTE_OFF, m, 0]), STATE.MIDI_DURATION_MS);
            } else if(STATE.activeSynth) {
                STATE.activeSynth.triggerAttackRelease(STATE.notesPerStep[idx], '16n', time);
            }
        }

        const mIdx = idx % STATE.numSquaresPerGroup;
        if(mIdx % STATE.metronomeInterval === 0) SYNTHS.metronome.triggerAttackRelease('16n', time, mIdx===0?0.6:0.2);

        Tone.Draw.schedule(() => {
            document.querySelectorAll('.active').forEach(e => e.classList.remove('active'));
            if(sq) sq.classList.add('active');
            if(STATE.metronomeSquares[mIdx]) STATE.metronomeSquares[mIdx].classList.add('active');
        }, time);

        STATE.currentStepIndex = (STATE.currentStepIndex + 1) % STATE.totalNumPatternSquares;
    }

    let loop;
    async function togglePlay() {
        SYNTHS.metronome.volume.value = 12;
        if(Tone.context.state !== 'running') await Tone.start();
        if(STATE.isPlaying) {
            Tone.Transport.stop(); DOM.playPauseBtn.textContent = 'Play Pattern'; STATE.isPlaying = false;
        } else {
            if(loop) loop.dispose();
            loop = new Tone.Loop(handlePlayback, '16n').start(0);
            Tone.Transport.start(); DOM.playPauseBtn.textContent = 'Stop'; STATE.isPlaying = true;
        }
    }

    function handleTimeChange() {
        const [b, t] = DOM.timeSignatureSelect.value.split('/');
        const beats = parseInt(b), type = parseInt(t);
        STATE.timeSignature = DOM.timeSignatureSelect.value;
        if(type === 4) { STATE.numSquaresPerGroup = beats * 4; STATE.subdivisionSize = 4; STATE.metronomeInterval = 4; }
        else { STATE.numSquaresPerGroup = beats * 2; STATE.subdivisionSize = 2; STATE.metronomeInterval = (beats%3===0 && beats>=6)?6:2; }
        
        const prev = DOM.stepGroupsSelect.value; DOM.stepGroupsSelect.innerHTML = '';
        [1,2,3,4].forEach(c => {
            const opt = document.createElement('option'); opt.value = c; opt.textContent = `${c*STATE.numSquaresPerGroup} Steps`; DOM.stepGroupsSelect.appendChild(opt);
        });
        DOM.stepGroupsSelect.value = prev || '1';
        STATE.numGroups = parseInt(DOM.stepGroupsSelect.value);

        createPatternSquares(); createMetronome();
    }

    function updateCount() { DOM.combinationsCountSpan.textContent = Math.pow(2, STATE.totalNumPatternSquares).toLocaleString(); }

    function exportXML() {
        const [b, bt] = STATE.timeSignature.split('/');
        const rowData = STATE.rowSemToneTranspositions.map((s, i) => ({ semitones: s, notePool: STATE.rowNotePools[i] }));
        const stateB64 = btoa(JSON.stringify(STATE.patternState));
        const custom = JSON.stringify({ rootNote: DOM.noteSelect.value, rootOctave: DOM.octaveSelect.value, rowData, patternStateBase64: stateB64 });
        
        let xml = `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Steps: ${STATE.totalNumPatternSquares}</part-name></score-part></part-list><part id="P1"><direction><direction-type><words>${custom}</words></direction-type></direction>`;
        let m = 1;
        STATE.patternState.forEach((isN, idx) => {
            if(idx % STATE.numSquaresPerGroup === 0) {
                if(idx>0) xml += `</measure>`; xml += `<measure number="${m++}">`;
                if(idx===0) xml += `<attributes><divisions>4</divisions><time><beats>${b}</beats><beat-type>${bt}</beat-type></time></attributes><sound tempo="${Tone.Transport.bpm.value}"/>`;
            }
            if(isN && STATE.notesPerStep[idx]) {
                const n = Tone.Midi(STATE.notesPerStep[idx]).toNote().match(/^([A-G])(#|b)?(\d+)$/);
                const alt = n[2]==='#'?1:(n[2]==='b'?-1:0);
                xml += `<note><pitch><step>${n[1]}</step>${alt?`<alter>${alt}</alter>`:''}<octave>${n[3]}</octave></pitch><duration>1</duration><type>16th</type></note>`;
            } else xml += `<note><rest/><duration>1</duration><type>16th</type></note>`;
        });
        xml += `</measure></part></score-partwise>`;
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([xml], {type: 'application/vnd.musicxml'})); a.download = 'pattern.musicxml'; a.click();
    }

    function loadXML(file) {
        const r = new FileReader();
        r.onload = (e) => {
            try {
                const doc = new DOMParser().parseFromString(e.target.result, "text/xml");
                const notes = doc.querySelectorAll('note');
                const ts = doc.querySelector('time');
                const tsStr = ts ? `${ts.querySelector('beats').textContent}/${ts.querySelector('beat-type').textContent}` : "4/4";
                let custom = {}; try { custom = JSON.parse(doc.querySelector('direction words').textContent); } catch(err){}
                
                DOM.timeSignatureSelect.value = tsStr;
                handleTimeChange();

                const total = notes.length;
                const grps = Math.ceil(total / STATE.numSquaresPerGroup);
                DOM.stepGroupsSelect.value = grps; STATE.numGroups = grps;
                createPatternSquares();

                if(custom.rootNote) DOM.noteSelect.value = custom.rootNote;
                if(custom.rootOctave) DOM.octaveSelect.value = custom.rootOctave;
                if(custom.rowData) custom.rowData.forEach((d, i) => { 
                    if(i < STATE.numGroups) {
                        STATE.rowSemToneTranspositions[i] = d.semitones;
                        STATE.rowNotePools[i] = d.notePool;
                        document.getElementById(`transpose-display-${i}`).textContent = getTransposeDisplay(d.semitones);
                        document.querySelectorAll('.controls-right select')[i].value = d.notePool;
                    }
                });

                const lps = custom.patternStateBase64 ? JSON.parse(atob(custom.patternStateBase64)) : null;
                
                STATE.patternSquares.forEach((sq, i) => {
                    if(i >= notes.length) return;
                    const isRest = !!notes[i].querySelector('rest');
                    const on = lps ? lps[i] : !isRest;
                    STATE.patternState[i] = on;
                    sq.classList.toggle('is-on', on);
                    
                    if(!isRest) {
                        const p = notes[i].querySelector('pitch');
                        const acc = p.querySelector('alter')?.textContent === '1' ? '#' : (p.querySelector('alter')?.textContent === '-1' ? 'b' : '');
                        STATE.notesPerStep[i] = `${p.querySelector('step').textContent}${acc}${p.querySelector('octave').textContent}`;
                    } else generateNotesForStep(i);
                });
                updateCount();
            } catch(e) { alert("Invalid XML"); }
        };
        r.readAsText(file);
    }

    async function setupMidi() {
        if(!navigator.requestMIDIAccess) return false;
        STATE.midiAccess = await navigator.requestMIDIAccess();
        DOM.midiOutputSelect.innerHTML = '';
        for(let o of STATE.midiAccess.outputs.values()) {
            const opt = document.createElement('option'); opt.value = o.id; opt.textContent = o.name; DOM.midiOutputSelect.appendChild(opt);
        }
        DOM.midiOutputSelect.disabled = DOM.midiOutputSelect.options.length === 0;
        if(!DOM.midiOutputSelect.disabled) STATE.midiOutput = STATE.midiAccess.outputs.get(DOM.midiOutputSelect.value);
    }

    // Listeners
    DOM.playPauseBtn.onclick = togglePlay;
    DOM.stepGroupsSelect.onchange = () => { STATE.numGroups = parseInt(DOM.stepGroupsSelect.value); createPatternSquares(); };
    DOM.timeSignatureSelect.onchange = handleTimeChange;
    DOM.noteSelect.onchange = generateAll;
    DOM.octaveSelect.onchange = generateAll;
    DOM.synthSelect.onchange = () => STATE.activeSynth = SYNTHS[DOM.synthSelect.value];
    DOM.tempoSlider.oninput = () => { Tone.Transport.bpm.value = DOM.tempoSlider.value; DOM.tempoDisplay.textContent = DOM.tempoSlider.value; };
    DOM.midiToggle.onchange = async () => { if(DOM.midiToggle.checked) await setupMidi(); else STATE.midiOutput = null; };
    DOM.midiOutputSelect.onchange = () => STATE.midiOutput = STATE.midiAccess.outputs.get(DOM.midiOutputSelect.value);
    DOM.exportBtn.onclick = exportXML;
    DOM.openBtn.onclick = () => DOM.fileInput.click();
    DOM.fileInput.onchange = (e) => e.target.files[0] && loadXML(e.target.files[0]);

    // Init
    handleTimeChange();
    STATE.activeSynth = SYNTHS[DOM.synthSelect.value];
    updateCount();
});
