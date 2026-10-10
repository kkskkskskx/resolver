(function () {
    'use strict';

    const TARGET_URL = '/groups/student/result/content';
    window.lastDecodedAnswer = null;

    function decodeBase64Content(base64) {
        try {
            const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
            const decoded = new TextDecoder('utf-8').decode(bytes);
            return JSON.parse(decoded);
        } catch (e) {
            console.error('Ошибка декодирования:', e);
            return null;
        }
    }

    function printLine(text) {
        console.log('%c' + (text || ''), 'color:#00ff00;font-size:14px;font-weight:bold;');
    }

    function getItemText(item) {
        return item?.value?.text || item?.value?.description || item?.value?.name || item?.text || '';
    }

    function extractGapsFromHtml(htmlString) {
        if (!htmlString) return [];
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');
        const gaps = doc.querySelectorAll('[data-gap]');
        return Array.from(gaps).map(el => el.getAttribute('data-gap'));
    }

    function showAnswers(decoded) {
        if (!decoded) return;

        console.clear();
        printLine('==============================');
        printLine('ПРАВИЛЬНЫЕ ОТВЕТЫ');
        printLine('==============================');

        const content = decoded.content || {};
        const result = decoded.result || {};

        if (content.columns && Array.isArray(content.columns) && content.columns[0]?.items) {
            printLine('Тип: Последовательность / SEQUENCE');
            content.columns[0].items.forEach((item, index) => {
                printLine((index + 1) + '. ' + getItemText(item));
            });
            return;
        }

        if (content.dndGroupList && Array.isArray(content.dndGroupList)) {
            printLine('Тип: Drag-and-Drop');
            content.dndGroupList.forEach((group, index) => {
                const drag = getItemText(group.draggableItem);
                const drop = getItemText(group.droppableItem);
                if (drag || drop) printLine((index + 1) + '. ' + (drag || '') + ' -> ' + (drop || ''));
            });
            return;
        }

        if (content.matchGroupList && Array.isArray(content.matchGroupList)) {
            printLine('Тип: Соединение элементов');
            content.matchGroupList.forEach((item, index) => {
                const left = item?.firstPart?.value?.text || item?.firstPart?.value?.description || item?.firstPart?.text || '';
                const right = item?.secondPart?.value?.text || item?.secondPart?.value?.description || item?.secondPart?.text || '';
                printLine((index + 1) + '. ' + left + ' -> ' + right);
            });
            return;
        }

        if (content.answerGroupList && Array.isArray(content.answerGroupList)) {
            printLine('Тип: Соединение элементов');
            content.answerGroupList.forEach((item, index) => {
                const left = item?.firstPart?.value?.text || item?.firstPart?.value?.description || item?.firstPart?.text || '';
                const right = item?.secondPart?.value?.text || item?.secondPart?.value?.description || item?.secondPart?.text || '';
                printLine((index + 1) + '. ' + left + ' -> ' + right);
            });
            return;
        }

        if (result.rightCode) {
            printLine('Тип: Python / Задание с кодом');
            printLine('--- Правильный код ---');
            console.log('%c' + result.rightCode, 'color:#00ffff;font-size:13px;font-family:monospace;');
            return;
        }

        if (content.subTaskList && Array.isArray(content.subTaskList)) {
            let foundCode = false;
            content.subTaskList.forEach((subTask, index) => {
                const code = subTask?.result?.rightCode || subTask?.rightCode;
                if (code) {
                    foundCode = true;
                    printLine('Задание ' + (index + 1) + ':');
                    console.log('%c' + code, 'color:#00ffff;font-size:13px;font-family:monospace;');
                }
            });
            if (foundCode) return;
        }

        if (content.gapType || content.html) {
            const answers = extractGapsFromHtml(content.html);
            if (answers.length > 0) {
                printLine('Тип: Заполнение пропусков');
                answers.forEach((answer, index) => {
                    printLine('Пропуск ' + (index + 1) + ': ' + answer);
                });
                return;
            }
        }

        if (content.questionList) {
            content.questionList.forEach((question, qIndex) => {
                const correctAnswers = question.answerList?.filter(a => a.isCorrect) || [];
                if (content.questionList.length > 1) printLine('Вопрос ' + (qIndex + 1) + ':');
                correctAnswers.forEach((answer, index) => {
                    printLine((index + 1) + '. ' + answer.text);
                });
            });
            return;
        }

        if (content.correctAnswer) {
            printLine(content.correctAnswer);
            return;
        }

        printLine('Тип задания не распознан');
        console.log(decoded);
    }

    function setNativeInputValue(element, value) {
        const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
        const prototype = Object.getPrototypeOf(element);
        const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

        if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
            prototypeValueSetter.call(element, value);
        } else if (valueSetter) {
            valueSetter.call(element, value);
        } else {
            element.value = value;
        }

        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function getReactProps(dom) {
        if (!dom) return null;
        for (const key in dom) {
            if (key.startsWith('__reactProps$') || key.startsWith('__reactFiber$')) {
                return dom[key];
            }
        }
        return null;
    }

    function findElementByText(text) {
        if (!text) return null;
        const targetText = text.trim();
        const allElements = document.querySelectorAll('div, span, p, label');

        for (const el of allElements) {
            if (el.children.length === 0 && el.textContent.trim() === targetText) {
                return el.closest('[data-rbd-draggable-id], [class*="card"], [class*="item"]') || el;
            }
        }
        return null;
    }

    function findDroppableZone(targetText) {
        const el = findElementByText(targetText);
        if (!el) return null;

        const parentRow = el.closest('[class*="flex"], [class*="row"], .ant-card, div') || el.parentElement;
        if (parentRow) {
            const dropZone = parentRow.querySelector('[data-rbd-droppable-id], [class*="droppable"]');
            if (dropZone) return dropZone;
        }
        return el;
    }

    function triggerClick(el) {
        if (!el) return;
        const opts = { bubbles: true, cancelable: true, view: window };
        el.dispatchEvent(new PointerEvent('pointerdown', opts));
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new PointerEvent('pointerup', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.click();
    }

    function findCircleByText(text) {
        if (!text) return null;
        const targetText = text.trim();
        const allElements = document.querySelectorAll('div, span, p, label');

        for (const el of allElements) {
            if (el.children.length === 0 && el.textContent.trim() === targetText) {
                let current = el;
                for (let i = 0; i < 6; i++) {
                    if (!current || !current.parentElement) break;
                    current = current.parentElement;

                    const circle = Array.from(current.querySelectorAll('div')).find(div => {
                        const style = div.getAttribute('style') || '';
                        return style.includes('position: absolute') &&
                            (style.includes('border-radius: 100%') || style.includes('width: 26px') || style.includes('right:') || style.includes('left:'));
                    });

                    if (circle) return circle;
                }
                return el;
            }
        }
        return null;
    }

    function autoSolve() {
        const decoded = window.lastDecodedAnswer;
        if (!decoded) {
            alert('Нет сохраненных данных ответа. Сначала откройте задание!');
            return;
        }

        const content = decoded.content || {};
        const result = decoded.result || {};

        if (content.dndGroupList && Array.isArray(content.dndGroupList)) {
            let movedCount = 0;
            content.dndGroupList.forEach((group) => {
                const dragText = getItemText(group.draggableItem);
                const dropText = getItemText(group.droppableItem);

                const dragEl = findElementByText(dragText);
                const dropZone = findDroppableZone(dropText) || findElementByText(dropText);

                if (dragEl && dropZone) {
                    const dragProps = getReactProps(dragEl);
                    const dropProps = getReactProps(dropZone);

                    if (dragProps && dragProps.onClick) dragProps.onClick();
                    if (dropProps && dropProps.onClick) dropProps.onClick();

                    movedCount++;
                }
            });

            if (movedCount > 0) {
                printLine('[AutoSolve] Ответы обработаны. Заполните карточки мышью по подсказкам в консоли.');
                return;
            }
        }

        const matchGroups = content.matchGroupList || content.answerGroupList;
        if (matchGroups && Array.isArray(matchGroups)) {
            let matchedCount = 0;

            matchGroups.forEach((group, idx) => {
                const leftText = group?.firstPart?.value?.text || group?.firstPart?.value?.description || group?.firstPart?.text;
                const rightText = group?.secondPart?.value?.text || group?.secondPart?.value?.description || group?.secondPart?.text;

                const leftCircle = findCircleByText(leftText);
                const rightCircle = findCircleByText(rightText);

                if (leftCircle && rightCircle) {
                    setTimeout(() => {
                        triggerClick(leftCircle);
                        setTimeout(() => {
                            triggerClick(rightCircle);
                        }, 150);
                    }, idx * 400);
                    matchedCount++;
                }
            });

            if (matchedCount > 0) {
                printLine('[AutoSolve] Соединение пар: ' + matchedCount);
                return;
            }
        }

        const code = result.rightCode || content.subTaskList?.[0]?.result?.rightCode || content.subTaskList?.[0]?.rightCode;
        if (code) {
            if (window.ace) {
                const editors = document.querySelectorAll('.ace_editor');
                editors.forEach(edEl => {
                    const editor = ace.edit(edEl);
                    if (editor) editor.setValue(code, -1);
                });
                printLine('[AutoSolve] Код вставлен в Ace Editor');
                return;
            }

            if (window.monaco) {
                const models = monaco.editor.getModels();
                if (models.length > 0) {
                    models[0].setValue(code);
                    printLine('[AutoSolve] Код вставлен в Monaco Editor');
                    return;
                }
            }

            const textareas = document.querySelectorAll('textarea');
            if (textareas.length > 0) {
                textareas.forEach(ta => {
                    setNativeInputValue(ta, code);
                });
                printLine('[AutoSolve] Код вставлен в textarea');
                return;
            }
        }

        if (content.questionList && Array.isArray(content.questionList)) {
            let selectedAny = false;

            content.questionList.forEach(question => {
                const correctList = question.answerList?.filter(a => a.isCorrect) || [];

                correctList.forEach(correctAnswer => {
                    const targetText = correctAnswer.text?.trim();
                    const el = findElementByText(targetText);
                    if (el) {
                        triggerClick(el);
                        selectedAny = true;
                    }
                });
            });

            if (selectedAny) {
                printLine('[AutoSolve] Ответ выбран');
                return;
            }
        }

        const gaps = extractGapsFromHtml(content.html);
        if (gaps.length > 0) {
            const inputs = document.querySelectorAll('input[type="text"], input:not([type])');
            inputs.forEach((input, index) => {
                if (gaps[index] !== undefined) {
                    setNativeInputValue(input, gaps[index]);
                }
            });
            printLine('[AutoSolve] Пропуски заполнены');
            return;
        }

        if (content.correctAnswer) {
            const input = document.querySelector('input[type="text"], textarea');
            if (input) {
                setNativeInputValue(input, content.correctAnswer);
                printLine('[AutoSolve] Ответ вставлен');
                return;
            }
        }

        printLine('[AutoSolve] Не удалось найти подходящие элементы.');
    }

    document.addEventListener('keydown', (e) => {
        if ((e.altKey && e.code === 'KeyH') || (e.ctrlKey && e.shiftKey && e.code === 'KeyH')) {
            e.preventDefault();
            printLine('Запуск авторешения...');
            autoSolve();
        }
    });

    function processResponse(data) {
        try {
            if (!data?.content) return;
            const decoded = decodeBase64Content(data.content);
            if (!decoded) return;

            window.lastDecodedAnswer = decoded;
            showAnswers(decoded);
        } catch (err) {
            console.error(err);
        }
    }

    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        const response = await originalFetch.apply(this, args);
        try {
            const url = String(args[0] || '');
            if (url.includes(TARGET_URL)) {
                const clone = response.clone();
                clone.json().then(data => processResponse(data));
            }
        } catch (e) {}
        return response;
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
        this._url = url;
        return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function () {
        this.addEventListener('load', () => {
            try {
                if (this._url && this._url.includes(TARGET_URL)) {
                    const data = JSON.parse(this.responseText);
                    processResponse(data);
                }
            } catch (e) {}
        });
        return originalSend.apply(this, arguments);
    };

    console.log('Logika School Answers & Auto-Solve v6.3 Loaded. Нажмите Alt + H.');
})();