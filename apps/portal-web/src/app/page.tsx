export default function PortalDashboard() {
  return (
    <div className="flex flex-col space-y-4">
      <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg">
        <h2 className="font-semibold text-blue-900">Not Connected</h2>
        <p className="text-sm text-blue-700 mt-1">Please buy a package or enter a voucher to connect to the internet.</p>
      </div>

      <div className="space-y-3">
        <h3 className="font-medium text-slate-800">Available Packages</h3>
        <div className="border border-slate-200 p-3 rounded-lg flex justify-between items-center cursor-pointer hover:border-blue-500">
          <div>
            <div className="font-medium">1 Hour Unlimited</div>
            <div className="text-xs text-slate-500">Valid for 1 hour</div>
          </div>
          <div className="font-bold text-blue-600">500 UGX</div>
        </div>
        <div className="border border-slate-200 p-3 rounded-lg flex justify-between items-center cursor-pointer hover:border-blue-500">
          <div>
            <div className="font-medium">24 Hours Unlimited</div>
            <div className="text-xs text-slate-500">Valid for 24 hours</div>
          </div>
          <div className="font-bold text-blue-600">1000 UGX</div>
        </div>
      </div>

      <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition-colors">
        Pay with Mobile Money (Yo!)
      </button>

      <div className="pt-4 border-t border-slate-100 flex flex-col space-y-2">
        <h3 className="font-medium text-slate-800 text-sm">Have a voucher?</h3>
        <input type="text" placeholder="Enter Voucher Code" className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <button className="w-full bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium py-2 rounded transition-colors">
          Redeem Voucher
        </button>
      </div>
    </div>
  )
}
