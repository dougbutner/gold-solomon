import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { runSuite } from "@/lib/solomon/suite";

export const Route = createFileRoute("/suite")({ component: SuitePage });

function SuitePage() {
  const rows = runSuite();
  const passed = rows.filter((r) => r.pass).length;
  return (
    <Shell>
      <h1 className="font-serif text-4xl">Math suite</h1>
      <p className="mt-2 max-w-xl text-muted">
        {passed}/{rows.length} checks. Same functions as the desk. Integer math only.
        A failed row would show NO.
      </p>
      <div className="mt-6 overflow-x-auto border border-line">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-surface text-muted">
            <tr>
              <th className="px-3 py-2 font-normal">Check</th>
              <th className="px-3 py-2 font-normal">Input</th>
              <th className="px-3 py-2 font-normal">Expected</th>
              <th className="px-3 py-2 font-normal">Actual</th>
              <th className="px-3 py-2 font-normal">Pass</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.check} className="border-t border-line">
                <td className="px-3 py-2">{r.check}</td>
                <td className="px-3 py-2 text-muted">{r.input}</td>
                <td className="desk-num px-3 py-2">{r.expected}</td>
                <td className="desk-num px-3 py-2">{r.actual}</td>
                <td className={"px-3 py-2 " + (r.pass ? "text-ok" : "text-bad")}>{r.pass ? "yes" : "NO"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
