import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Input: paste, drop a file, or load an example.
 *
 * The format picker shows what auto-detection chose and lets the user override it — detection is
 * a heuristic over ambiguous text, so it has to be correctable rather than authoritative.
 */
import { useCallback, useRef, useState } from 'react';
import { EXAMPLES } from '../examples.js';
export function InputPanel({ text, detections, adapterId, effectiveAdapterId, status, onChangeText, onChangeAdapter, onParse, }) {
    const [isDragging, setDragging] = useState(false);
    const fileInput = useRef(null);
    const readFile = useCallback(async (file) => {
        onChangeText(await file.text(), file.name);
    }, [onChangeText]);
    return (_jsxs("section", { className: `flex h-full flex-col gap-2 p-3 ${isDragging ? 'bg-sky-500/10' : ''}`, onDragOver: (event) => {
            event.preventDefault();
            setDragging(true);
        }, onDragLeave: () => setDragging(false), onDrop: (event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files[0];
            if (file !== undefined)
                void readFile(file);
        }, children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("label", { htmlFor: "format", className: "text-xs text-slate-400", children: "Format" }), _jsxs("select", { id: "format", className: "rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200", value: adapterId ?? 'auto', onChange: (event) => onChangeAdapter(event.target.value === 'auto' ? null : event.target.value), children: [_jsxs("option", { value: "auto", children: ["Auto", effectiveAdapterId !== null ? ` — ${labelFor(detections, effectiveAdapterId)}` : ''] }), detections.map(({ adapter, confidence }) => (_jsxs("option", { value: adapter.id, children: [adapter.label, " (", Math.round(confidence * 100), "%)"] }, adapter.id)))] }), _jsx("button", { type: "button", className: "rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800", onClick: () => fileInput.current?.click(), children: "Open file\u2026" }), _jsx("input", { ref: fileInput, type: "file", className: "hidden", onChange: (event) => {
                            const file = event.target.files?.[0];
                            if (file !== undefined)
                                void readFile(file);
                        } }), _jsx("button", { type: "button", className: "ml-auto rounded bg-sky-600 px-3 py-1 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-40", disabled: text.trim() === '' || status === 'parsing', onClick: onParse, children: status === 'parsing' ? 'Parsing…' : 'Visualise' })] }), _jsx("textarea", { "aria-label": "Object source", spellCheck: false, placeholder: "Paste repr() output, pprint output, or JSON \u2014 then press Visualise (\u2318\u23CE)", className: "min-h-0 flex-1 resize-none rounded border border-slate-800 bg-slate-950 p-2 font-mono text-xs text-slate-200 outline-none focus:border-sky-700", value: text, onChange: (event) => onChangeText(event.target.value), onKeyDown: (event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter')
                        onParse();
                } }), _jsxs("div", { className: "flex flex-wrap gap-1.5", children: [_jsx("span", { className: "py-0.5 text-[11px] text-slate-500", children: "Examples:" }), EXAMPLES.map((example) => (_jsx("button", { type: "button", title: example.description, className: "rounded border border-slate-800 px-1.5 py-0.5 text-[11px] text-slate-400 hover:border-slate-600 hover:text-slate-200", onClick: () => onChangeText(example.text), children: example.name }, example.name)))] })] }));
}
function labelFor(detections, id) {
    return detections.find((d) => d.adapter.id === id)?.adapter.label ?? id;
}
//# sourceMappingURL=InputPanel.js.map