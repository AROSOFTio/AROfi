export default function Dashboard() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <h3 className="text-slate-400 mb-2">Total Tenants</h3>
        <p className="text-3xl font-bold">12</p>
      </div>
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <h3 className="text-slate-400 mb-2">Active Hotspots</h3>
        <p className="text-3xl font-bold text-emerald-400">45</p>
      </div>
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <h3 className="text-slate-400 mb-2">Monthly Revenue</h3>
        <p className="text-3xl font-bold text-blue-400">$12,450</p>
      </div>
    </div>
  )
}
