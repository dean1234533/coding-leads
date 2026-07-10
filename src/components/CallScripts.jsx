import { SCRIPTS, SCRIPT_COLOUR_MAP } from '../utils/callScripts';

function ScriptCard({ script }) {
  const c = SCRIPT_COLOUR_MAP[script.colour];
  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-5 space-y-4`}>
      <div>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${c.badge}`}>
          {script.label}
        </span>
        <p className="mt-2 text-xs text-gray-500 leading-relaxed">{script.intro}</p>
      </div>

      {script.steps.map((step) => (
        <div key={step.heading}>
          <h3 className={`mb-2 text-[11px] font-bold uppercase tracking-widest ${c.heading}`}>
            {step.heading}
          </h3>
          <ul className="space-y-2">
            {step.lines.map((line, i) => (
              <li key={i} className={`rounded-lg px-3 py-2 text-sm leading-relaxed break-words ${
                line.startsWith('(')
                  ? 'text-gray-600 italic text-xs'
                  : 'bg-gray-900/60 text-gray-300'
              }`}>
                {line}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function CallScripts() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Call Scripts</h1>
        <p className="text-xs text-gray-500">
          Word-for-word guides for every stage of the sales conversation.
        </p>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4 text-xs text-gray-500 leading-relaxed">
        <span className="font-semibold text-gray-400">Tip:</span> Don't read these word for word — use them as a framework. Sound natural, slow down, and let them talk. The more they talk, the more you learn. Open a lead in the Outreach CRM and use its Call Script tab to get these pre-filled with that business's name.
      </div>

      <div className="space-y-6">
        {SCRIPTS.map((script) => (
          <ScriptCard key={script.id} script={script} />
        ))}
      </div>
    </div>
  );
}
