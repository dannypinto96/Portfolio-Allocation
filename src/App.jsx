import { useState, useEffect } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'

const COLORS = [
  '#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8',
  '#82CA9D', '#FFC658', '#FF7C7C', '#8DD1E1', '#D084D0'
]

// Function to fetch Bitcoin price
const fetchBitcoinPrice = async () => {
  try {
    // Use CoinGecko API for Bitcoin price
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
    const data = await response.json()
    
    if (data.bitcoin && data.bitcoin.usd) {
      return data.bitcoin.usd
    }
    throw new Error('Bitcoin price not found')
  } catch (error) {
    console.error('Error fetching Bitcoin price:', error)
    // Fallback: try alternative API
    try {
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent('https://api.coinbase.com/v2/exchange-rates?currency=BTC')}`
      const response = await fetch(proxyUrl)
      const proxyData = await response.json()
      const data = JSON.parse(proxyData.contents)
      
      if (data.data && data.data.rates && data.data.rates.USD) {
        return parseFloat(data.data.rates.USD)
      }
    } catch (err) {
      throw new Error('Failed to fetch Bitcoin price')
    }
    throw new Error('Failed to fetch Bitcoin price')
  }
}

// Function to fetch stock price using CORS proxy
const fetchStockPrice = async (ticker) => {
  const upperTicker = ticker.toUpperCase()
  
  // Check if it's Bitcoin
  if (upperTicker === 'BTC' || upperTicker === 'BITCOIN') {
    return await fetchBitcoinPrice()
  }
  
  // Use CORS proxy to access Yahoo Finance API
  try {
    // Method 1: Using allorigins CORS proxy
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${upperTicker}`
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(yahooUrl)}`
    
    const response = await fetch(proxyUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    })
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const proxyData = await response.json()
    
    if (!proxyData.contents) {
      throw new Error('No data received from proxy')
    }
    
    const data = JSON.parse(proxyData.contents)
    
    if (data.chart && data.chart.result && data.chart.result[0]) {
      const price = data.chart.result[0].meta?.regularMarketPrice
      if (price && price > 0) {
        return price
      }
    }
    
    // Try alternative price field
    if (data.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.[0]) {
      const price = data.chart.result[0].indicators.quote[0].close[0]
      if (price && price > 0) {
        return price
      }
    }
    
    throw new Error('Price data not found in response')
  } catch (error) {
    console.error('Error fetching stock price:', error)
    throw new Error(`Failed to fetch price for ${upperTicker}. ${error.message}. Please check the ticker symbol and try again.`)
  }
}

function App() {
  const [assets, setAssets] = useState([])
  const [ticker, setTicker] = useState('')
  const [shares, setShares] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [manualPrice, setManualPrice] = useState('')
  const [useManualPrice, setUseManualPrice] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editShares, setEditShares] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [isCash, setIsCash] = useState(false)
  const [cashAmount, setCashAmount] = useState('')

  // Load assets from localStorage on mount
  useEffect(() => {
    const savedAssets = localStorage.getItem('portfolioAssets')
    if (savedAssets) {
      setAssets(JSON.parse(savedAssets))
    }
  }, [])

  // Save assets to localStorage whenever assets change
  useEffect(() => {
    localStorage.setItem('portfolioAssets', JSON.stringify(assets))
  }, [assets])

  const addAsset = async (e) => {
    e.preventDefault()
    setError('')
    
    // Handle cash addition
    if (isCash) {
      const amount = parseFloat(cashAmount)
      if (amount > 0) {
        setAssets([...assets, {
          id: Date.now(),
          ticker: 'CASH',
          shares: 1,
          price: amount,
          value: amount,
          isCash: true
        }])
        setCashAmount('')
        setIsCash(false)
        return
      } else {
        setError('Cash amount must be greater than 0')
        return
      }
    }
    
    // Handle stock/crypto addition
    if (ticker && shares) {
      const numShares = parseFloat(shares)
      if (numShares > 0) {
        let price
        const upperTicker = ticker.toUpperCase()
        
        if (useManualPrice && manualPrice) {
          // Use manually entered price
          price = parseFloat(manualPrice)
          if (price <= 0) {
            setError('Price must be greater than 0')
            return
          }
        } else {
          // Fetch price from API
          setLoading(true)
          try {
            price = await fetchStockPrice(upperTicker)
          } catch (err) {
            setError(`Failed to fetch price for ${upperTicker}. ${err.message} You can enter the price manually by checking "Enter price manually".`)
            setLoading(false)
            return
          } finally {
            setLoading(false)
          }
        }
        
        const value = numShares * price
        
        setAssets([...assets, {
          id: Date.now(),
          ticker: upperTicker,
          shares: numShares,
          price: price,
          value: value
        }])
        setTicker('')
        setShares('')
        setManualPrice('')
        setUseManualPrice(false)
      } else {
        setError('Number of shares must be greater than 0')
      }
    }
  }

  const deleteAsset = (id) => {
    setAssets(prevAssets => prevAssets.filter(asset => asset.id !== id))
  }

  const refreshPrice = async (id, ticker) => {
    if (!ticker) return
    setLoading(true)
    try {
      const price = await fetchStockPrice(ticker)
      setAssets(prevAssets => prevAssets.map(asset => {
        if (asset.id === id && asset.shares) {
          return { ...asset, price: price, value: asset.shares * price }
        }
        return asset
      }))
    } catch (err) {
      setError(`Failed to refresh price for ${ticker}`)
    } finally {
      setLoading(false)
    }
  }

  const startEdit = (asset) => {
    setEditingId(asset.id)
    if (asset.isCash) {
      setEditPrice(asset.value ? asset.value.toString() : '')
      setEditShares('')
    } else {
      setEditShares(asset.shares ? asset.shares.toString() : '')
      setEditPrice(asset.price ? asset.price.toString() : '')
    }
    setError('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditShares('')
    setEditPrice('')
    setError('')
  }

  const saveEdit = () => {
    if (!editingId) return
    
    // Find the asset first to validate
    const asset = assets.find(a => a.id === editingId)
    if (!asset) return
    
    if (asset.isCash) {
      // For cash, just update the amount
      const newAmount = parseFloat(editPrice)
      if (newAmount <= 0) {
        setError('Cash amount must be greater than 0')
        return
      }
      
      setAssets(prevAssets => prevAssets.map(a => {
        if (a.id === editingId) {
          return {
            ...a,
            price: newAmount,
            value: newAmount
          }
        }
        return a
      }))
    } else {
      // For stocks/crypto, update shares and price
      const newShares = parseFloat(editShares)
      const newPrice = parseFloat(editPrice)
      
      if (newShares <= 0) {
        setError('Number of shares must be greater than 0')
        return
      }
      
      if (newPrice <= 0) {
        setError('Price must be greater than 0')
        return
      }
      
      setAssets(prevAssets => prevAssets.map(a => {
        if (a.id === editingId) {
          return {
            ...a,
            shares: newShares,
            price: newPrice,
            value: newShares * newPrice
          }
        }
        return a
      }))
    }
    
    cancelEdit()
  }

  const totalValue = assets.reduce((sum, asset) => sum + (asset.value || 0), 0)

  // Group by ticker for pie chart
  const tickerData = assets.reduce((acc, asset) => {
    const tickerName = asset.ticker || asset.name || 'Unknown'
    const existing = acc.find(item => item.name === tickerName)
    if (existing) {
      existing.value += asset.value
    } else {
      acc.push({ name: tickerName, value: asset.value })
    }
    return acc
  }, [])

  // Calculate percentages
  const tickerDataWithPercentage = tickerData.map(item => ({
    ...item,
    percentage: totalValue > 0 ? ((item.value / totalValue) * 100).toFixed(1) : 0
  }))

  const renderLabel = (entry) => {
    return `${entry.name}: ${entry.percentage}%`
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Portfolio Asset Allocation Tracker
          </h1>
          <p className="text-gray-600">Track and visualize your investment portfolio</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Input Form */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">Add Asset</h2>
              <form onSubmit={addAsset} className="space-y-4">
                <div className="flex items-center pb-2 border-b border-gray-200">
                  <input
                    type="checkbox"
                    id="isCash"
                    checked={isCash}
                    onChange={(e) => {
                      setIsCash(e.target.checked)
                      setTicker('')
                      setShares('')
                      setCashAmount('')
                      setError('')
                    }}
                    className="mr-2"
                    disabled={loading}
                  />
                  <label htmlFor="isCash" className="text-sm font-medium text-gray-700">
                    Add Cash
                  </label>
                </div>
                
                {isCash ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Cash Amount ($)
                    </label>
                    <input
                      type="number"
                      value={cashAmount}
                      onChange={(e) => setCashAmount(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="10000"
                      min="0"
                      step="0.01"
                      required
                      disabled={loading}
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Ticker Symbol
                      </label>
                      <input
                        type="text"
                        value={ticker}
                        onChange={(e) => setTicker(e.target.value.toUpperCase())}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., AAPL, MSFT, TSLA, BTC"
                        required={!isCash}
                        disabled={loading}
                      />
                      <p className="text-xs text-gray-500 mt-1">Supports stocks (AAPL, MSFT) and Bitcoin (BTC)</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Number of Shares/Coins
                      </label>
                      <input
                        type="number"
                        value={shares}
                        onChange={(e) => setShares(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="10"
                        min="0"
                        step="0.0001"
                        required={!isCash}
                        disabled={loading}
                      />
                    </div>
                  </>
                )}
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="manualPrice"
                    checked={useManualPrice}
                    onChange={(e) => setUseManualPrice(e.target.checked)}
                    className="mr-2"
                    disabled={loading}
                  />
                  <label htmlFor="manualPrice" className="text-sm text-gray-700">
                    Enter price manually
                  </label>
                </div>
                {useManualPrice && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Price per Share ($)
                    </label>
                    <input
                      type="number"
                      value={manualPrice}
                      onChange={(e) => setManualPrice(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="150.00"
                      min="0"
                      step="0.01"
                      disabled={loading}
                    />
                  </div>
                )}
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors font-medium disabled:bg-blue-400 disabled:cursor-not-allowed"
                >
                  {loading ? 'Fetching Price...' : 'Add Asset'}
                </button>
              </form>
            </div>

            {/* Asset List */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">Your Assets</h2>
              {assets.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No assets added yet</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {assets.map((asset) => (
                    <div
                      key={asset.id}
                      className={`p-3 rounded-md transition-colors ${editingId === asset.id ? 'bg-blue-50 border-2 border-blue-300' : 'bg-gray-50 hover:bg-gray-100'}`}
                    >
                      {editingId === asset.id ? (
                        // Edit mode
                        <div className="space-y-3">
                          <div className="font-medium text-gray-800 mb-2">{asset.ticker || asset.name}</div>
                          {asset.isCash ? (
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Cash Amount ($)</label>
                              <input
                                type="number"
                                value={editPrice}
                                onChange={(e) => setEditPrice(e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                min="0"
                                step="0.01"
                              />
                            </div>
                          ) : (
                            <>
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Shares/Coins</label>
                                <input
                                  type="number"
                                  value={editShares}
                                  onChange={(e) => setEditShares(e.target.value)}
                                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  min="0"
                                  step="0.0001"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Price per Share/Coin ($)</label>
                                <input
                                  type="number"
                                  value={editPrice}
                                  onChange={(e) => setEditPrice(e.target.value)}
                                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  min="0"
                                  step="0.01"
                                />
                              </div>
                            </>
                          )}
                          {error && editingId === asset.id && (
                            <div className="bg-red-50 border border-red-200 text-red-700 px-2 py-1 rounded text-xs">
                              {error}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={saveEdit}
                              className="flex-1 bg-green-600 text-white py-1 px-3 rounded text-sm hover:bg-green-700 transition-colors"
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="flex-1 bg-gray-400 text-white py-1 px-3 rounded text-sm hover:bg-gray-500 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        // Display mode
                        <div className="flex justify-between items-center">
                          <div className="flex-1">
                            <div className="font-medium text-gray-800">
                              {asset.isCash ? '💵 Cash' : (asset.ticker || asset.name)}
                            </div>
                            {!asset.isCash && (
                              <div className="text-sm text-gray-600">
                                {asset.shares ? `${asset.shares} shares` : ''} {asset.price ? `@ $${asset.price.toFixed(2)}` : ''}
                              </div>
                            )}
                            <div className="text-sm font-semibold text-gray-800">
                              ${asset.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => startEdit(asset)}
                              className="text-green-600 hover:text-green-800 font-medium text-xs"
                              title="Edit asset"
                            >
                              ✎
                            </button>
                            {asset.ticker && (
                              <button
                                onClick={() => refreshPrice(asset.id, asset.ticker)}
                                disabled={loading}
                                className="text-blue-600 hover:text-blue-800 font-medium text-xs disabled:text-gray-400"
                                title="Refresh price"
                              >
                                ↻
                              </button>
                            )}
                            <button
                              onClick={() => deleteAsset(asset.id)}
                              className="text-red-600 hover:text-red-800 font-medium"
                              title="Delete asset"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Charts and Metrics */}
          <div className="lg:col-span-2">
            {/* Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="text-sm text-gray-600 mb-1">Total Portfolio Value</div>
                <div className="text-3xl font-bold text-gray-800">
                  ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="text-sm text-gray-600 mb-1">Number of Assets</div>
                <div className="text-3xl font-bold text-gray-800">{assets.length}</div>
              </div>
              <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="text-sm text-gray-600 mb-1">Unique Tickers</div>
                <div className="text-3xl font-bold text-gray-800">{tickerData.length}</div>
              </div>
            </div>

            {/* Pie Chart */}
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">Asset Allocation by Ticker</h2>
              {tickerData.length === 0 ? (
                <div className="flex items-center justify-center h-64 text-gray-500">
                  Add assets to see your allocation chart
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={400}>
                  <PieChart>
                    <Pie
                      data={tickerDataWithPercentage}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={renderLabel}
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {tickerDataWithPercentage.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Ticker Breakdown Table */}
            {tickerData.length > 0 && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-2xl font-semibold text-gray-800 mb-4">Ticker Breakdown</h2>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Ticker</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-700">Value</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-700">Percentage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tickerDataWithPercentage
                        .sort((a, b) => b.value - a.value)
                        .map((item, index) => (
                          <tr key={item.name} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-3 px-4">
                              <div className="flex items-center">
                                <div
                                  className="w-4 h-4 rounded-full mr-2"
                                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                                />
                                <span className="font-medium text-gray-800">{item.name}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right text-gray-700">
                              ${item.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-3 px-4 text-right text-gray-700 font-semibold">
                              {item.percentage}%
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App

