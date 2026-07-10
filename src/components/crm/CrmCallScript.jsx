import { useState } from 'react';
import { SCRIPTS, SCRIPT_COLOUR_MAP, fillCallScriptLine } from '../../utils/callScripts';

export default function CrmCallScript({ lead }) {
  const [scriptId, setScriptId] = useState(SCRIPTS[0].id);
  const script = SCRIPTS.find((s) => s.id === scriptId);
  const c = SCRIPT_COLOUR_MAP[script.colour];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-xl border border-gray-800 bg-gray-950 p-1">
        {SCRIPTS.map((s) => (
          <button
            key={s.id}
            onClick={() => setScriptId(s.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              scriptId === s.id ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className={`rounded-xl border ${c.border} ${c.bg} p-4 space-y-4`}>
        <p className="text-xs text-gray-500 leading-relaxed">{script.intro}</p>

        {script.steps.map((step) => (
          <div key={step.heading}>
            <h3 className={`mb-2 text-[11px] font-bold uppercase tracking-widest ${c.heading}`}>
              {step.heading}
            </h3>
            <ul className="space-y-2">
              {step.lines.map((line, i) => {
                const filled = fillCallScriptLine(line, lead);
                return (
                  <li key={i} className={`rounded-lg px-3 py-2 text-sm leading-relaxed break-words ${
                    line.startsWith('(')
                      ? 'text-gray-600 italic text-xs'
                      : 'bg-gray-900/60 text-gray-300'
                  }`}>
                    {filled}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
