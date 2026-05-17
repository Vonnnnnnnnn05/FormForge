/* ===== FormForge — App Logic ===== */

(function () {
    'use strict';

    // ── DOM References ──
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const textInput     = $('#text-input');
    const fileInput     = $('#file-input');
    const dropzone      = $('#dropzone');
    const fileInfo      = $('#file-info');
    const fileName      = $('#file-name');
    const fileRemove    = $('#file-remove');
    const parseBtn      = $('#parse-btn');
    const parseError    = $('#parse-error');
    const cardPreview   = $('#card-preview');
    const questionsList = $('#questions-list');
    const questionCount = $('#question-count');
    const formTitle     = $('#form-title');
    const formDesc      = $('#form-desc');
    const isQuiz        = $('#is-quiz');
    const isRequired    = $('#is-required');
    const generateBtn   = $('#generate-btn');
    const cardOutput    = $('#card-output');
    const scriptOutput  = $('#script-output');
    const copyBtn       = $('#copy-btn');
    const startOverBtn  = $('#start-over-btn');
    const toast         = $('#toast');

    let parsedQuestions = [];
    let detectedTitle   = '';
    let uploadedFile    = null;

    // ── Tab Switching ──
    $$('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            $$('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            $$('.tab-panel').forEach(p => p.classList.remove('active'));
            $(`#${tab.dataset.tab}-panel`).classList.add('active');
        });
    });

    // ── Drag & Drop ──
    ['dragenter', 'dragover'].forEach(evt => {
        dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
    });
    ['dragleave', 'drop'].forEach(evt => {
        dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.remove('drag-over'); });
    });
    dropzone.addEventListener('drop', e => {
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    });
    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) handleFile(fileInput.files[0]);
    });
    fileRemove.addEventListener('click', () => {
        uploadedFile = null;
        fileInfo.style.display = 'none';
        dropzone.style.display = '';
        fileInput.value = '';
    });

    function handleFile(file) {
        if (!file.name.match(/\.docx?$/i)) {
            showError('Please upload a .docx file.');
            return;
        }
        uploadedFile = file;
        fileName.textContent = file.name;
        fileInfo.style.display = 'flex';
        dropzone.style.display = 'none';
        hideError();
    }

    // ── Parse Button ──
    parseBtn.addEventListener('click', async () => {
        hideError();
        const activeTab = $('.tab.active').dataset.tab;
        let rawText = '';

        if (activeTab === 'paste') {
            rawText = textInput.value.trim();
            if (!rawText) { showError('Please paste your questions first.'); return; }
        } else {
            if (!uploadedFile) { showError('Please upload a .docx file first.'); return; }
            try {
                parseBtn.textContent = 'Reading file…';
                const arrayBuffer = await uploadedFile.arrayBuffer();
                const result = await mammoth.extractRawText({ arrayBuffer });
                rawText = result.value;
            } catch (err) {
                showError('Failed to read the DOCX file. ' + err.message);
                resetParseBtn();
                return;
            }
        }

        parseBtn.textContent = 'Parsing…';
        parsedQuestions = parseQuestions(rawText);

        if (parsedQuestions.length === 0) {
            showError('No questions found. Make sure your format includes "Question N", options (A–D), and "Answer: X".');
            resetParseBtn();
            return;
        }

        renderPreview();
        resetParseBtn();
        cardPreview.style.display = '';
        cardPreview.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // ── Question Parser ──
    function parseQuestions(text) {
        const questions = [];

        // Detect a title from the first non-empty line before any question-like header
        const lines = text.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (/^question\s+\d+/i.test(trimmed) || /^#{1,6}\s*\d+\./.test(trimmed) || /^\d+\.\s+/.test(trimmed)) break;
            detectedTitle = trimmed;
            break;
        }

        // Choose a splitting strategy depending on the input format
        let blocks;
        if (/Question\s+\d+/i.test(text)) {
            blocks = text.split(/(?=Question\s+\d+)/i);
        } else if (/^#{1,6}\s*\d+\./m.test(text)) {
            blocks = text.split(/(?=^#{1,6}\s*\d+\.)/m);
        } else {
            // Fallback: numbered list style (e.g. "1. ")
            blocks = text.split(/(?=^\s*\d+\.\s+)/m);
        }

        for (const block of blocks) {
            const bLines = block.split('\n').map(l => l.trim()).filter(l => l);
            if (bLines.length === 0) continue;

            // Try multiple header styles: "Question N", Markdown "## N. Text", or "N. Text"
            let num = null;
            let questionText = '';

            const qMatch1 = bLines[0].match(/^Question\s+(\d+)/i);
            if (qMatch1) {
                num = parseInt(qMatch1[1]);
            } else {
                const mdMatch = bLines[0].match(/^#{1,6}\s*(\d+)\.\s*(.*)/);
                if (mdMatch) {
                    num = parseInt(mdMatch[1]);
                    questionText = (mdMatch[2] || '').trim();
                } else {
                    const numMatch = bLines[0].match(/^(\d+)\.\s*(.*)/);
                    if (numMatch) {
                        num = parseInt(numMatch[1]);
                        questionText = (numMatch[2] || '').trim();
                    }
                }
            }

            if (!num) continue;

            // Locate where options start (lines like "A. ..." or "A) ...")
            let optStart = -1;
            for (let i = 0; i < bLines.length; i++) {
                if (/^[A-Da-d][\.\)]\s+/.test(bLines[i])) { optStart = i; break; }
                if (/^[-*]\s*[A-Da-d][\.\)]\s+/.test(bLines[i])) { optStart = i; bLines[i] = bLines[i].replace(/^[-*]\s*/, ''); break; }
            }

            // If question text wasn't on the header line, collect lines until options
            if (!questionText) {
                let qText = '';
                for (let i = 1; i < (optStart === -1 ? bLines.length : optStart); i++) {
                    qText += (qText ? ' ' : '') + bLines[i];
                }
                questionText = qText.trim();
            }

            if (optStart === -1) {
                // Try again scanning from line 1
                for (let i = 1; i < bLines.length; i++) {
                    if (/^[A-Da-d][\.\)]\s+/.test(bLines[i])) { optStart = i; break; }
                }
            }
            if (optStart === -1) continue;

            const options = {};
            for (let i = optStart; i < bLines.length; i++) {
                const m = bLines[i].match(/^([A-Da-d])[\.\)]\s*(.*)/);
                if (m) options[m[1].toUpperCase()] = m[2].trim();
            }

            // Answer line may be plain or wrapped in markdown bold: e.g. "Answer: B" or "**Answer: B**"
            const ansLine = bLines.find(l => /Answer\s*[:\-]?\s*\*?[A-Da-d]\*?/i.test(l));
            const answer = ansLine ? ansLine.match(/Answer\s*[:\-]?\s*\*?([A-Da-d])\*?/i)[1].toUpperCase() : null;

            if (Object.keys(options).length >= 2 && answer) {
                questions.push({ num, text: questionText, options, answer });
            }
        }

        return questions;
    }

    // ── Render Preview ──
    function renderPreview() {
        questionCount.textContent = parsedQuestions.length;
        formTitle.value = detectedTitle || 'My Quiz';

        let html = '';
        parsedQuestions.forEach((q, i) => {
            html += `<div class="question-item">
                <div class="question-num">Question ${q.num}</div>
                <div class="question-text">${escapeHtml(q.text)}</div>
                <div class="question-options">`;
            for (const [letter, text] of Object.entries(q.options)) {
                const isCorrect = letter === q.answer;
                html += `<div class="question-option${isCorrect ? ' correct' : ''}">
                    <span class="option-letter">${letter}.</span>
                    <span>${escapeHtml(text)}${isCorrect ? ' ✓' : ''}</span>
                </div>`;
            }
            html += `</div></div>`;
        });
        questionsList.innerHTML = html;
    }

    // ── Generate Script ──
    generateBtn.addEventListener('click', () => {
        const title = formTitle.value.trim() || 'My Quiz';
        const desc  = formDesc.value.trim();
        const quiz  = isQuiz.checked;
        const req   = isRequired.checked;
        const script = generateAppsScript(parsedQuestions, title, desc, quiz, req);
        scriptOutput.textContent = script;
        cardOutput.style.display = '';
        cardOutput.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // ── Script Generator ──
    function generateAppsScript(questions, title, desc, isQuizMode, allRequired) {
        let s = `function createGoogleForm() {\n`;
        s += `  var form = FormApp.create(${JSON.stringify(title)});\n`;
        if (desc) s += `  form.setDescription(${JSON.stringify(desc)});\n`;
        if (isQuizMode) s += `  form.setIsQuiz(true);\n`;
        s += `\n  var item;\n\n`;

        questions.forEach((q, i) => {
            s += `  // Question ${q.num}\n`;
            s += `  item = form.addMultipleChoiceItem();\n`;
            s += `  item.setTitle(${JSON.stringify(q.text)});\n`;
            s += `  item.setChoices([\n`;
            const optEntries = Object.entries(q.options);
            optEntries.forEach(([letter, text], j) => {
                const correct = letter === q.answer;
                const comma = j < optEntries.length - 1 ? ',' : '';
                s += `    item.createChoice(${JSON.stringify(text)}, ${correct})${comma}\n`;
            });
            s += `  ]);\n`;
            if (allRequired) s += `  item.setRequired(true);\n`;
            if (isQuizMode) s += `  item.setPoints(1);\n`;
            s += `\n`;
        });

        s += `  // Log the form URLs\n`;
        s += `  Logger.log('✅ Form created successfully!');\n`;
        s += `  Logger.log('📝 Edit URL: ' + form.getEditUrl());\n`;
        s += `  Logger.log('🔗 Share URL: ' + form.getPublishedUrl());\n`;
        s += `}\n`;

        return s;
    }

    // ── Copy Button ──
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(scriptOutput.textContent).then(() => {
            copyBtn.classList.add('copied');
            copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
            showToast('Script copied to clipboard!');
            setTimeout(() => {
                copyBtn.classList.remove('copied');
                copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy Script`;
            }, 2500);
        });
    });

    // ── Start Over ──
    startOverBtn.addEventListener('click', () => {
        parsedQuestions = [];
        detectedTitle = '';
        uploadedFile = null;
        textInput.value = '';
        fileInput.value = '';
        fileInfo.style.display = 'none';
        dropzone.style.display = '';
        cardPreview.style.display = 'none';
        cardOutput.style.display = 'none';
        questionsList.innerHTML = '';
        scriptOutput.textContent = '';
        hideError();
        $('#card-input').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // ── Helpers ──
    function showError(msg) {
        parseError.textContent = msg;
        parseError.style.display = '';
    }
    function hideError() { parseError.style.display = 'none'; }
    function resetParseBtn() {
        parseBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Parse Questions`;
    }
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
    function showToast(msg) {
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2500);
    }
})();
