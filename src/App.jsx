import { useState, useEffect, useRef } from 'react'
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
  
  // Use CORS proxy to access Yahoo Finance API with timeout
  try {
    // Method 1: Using allorigins CORS proxy with timeout
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${upperTicker}`
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(yahooUrl)}`
    
    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timeout - the API took too long to respond')), 15000)
    )
    
    // Race between fetch and timeout
    const response = await Promise.race([
      fetch(proxyUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        }
      }),
      timeoutPromise
    ])
    
    if (!response.ok) {
      if (response.status === 408 || response.status === 504) {
        throw new Error('Request timeout - please try again or enter price manually')
      }
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const proxyData = await response.json()
    
    if (!proxyData.contents) {
      throw new Error('No data received from proxy')
    }
    
    const data = JSON.parse(proxyData.contents)
    
    // Check for errors in Yahoo Finance response
    if (data.chart?.error) {
      throw new Error(`Ticker "${upperTicker}" not found. Please verify the ticker symbol is correct.`)
    }
    
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
    
    // Provide more helpful error messages
    if (error.message.includes('timeout') || error.message.includes('408') || error.message.includes('504')) {
      throw new Error(`Request timed out for ${upperTicker}. The ticker may not be available, or the API is slow. Please try again or enter the price manually.`)
    }
    
    if (error.message.includes('not found')) {
      throw new Error(`Ticker "${upperTicker}" not found. Please verify the ticker symbol is correct, or enter the price manually.`)
    }
    
    throw new Error(`Failed to fetch price for ${upperTicker}. ${error.message}. Please check the ticker symbol and try again, or enter the price manually.`)
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
  const [isManualAsset, setIsManualAsset] = useState(false)
  const [manualAssetName, setManualAssetName] = useState('')
  const [manualAssetValue, setManualAssetValue] = useState('')
  const [sortColumn, setSortColumn] = useState('value') // 'ticker', 'shares', 'price', 'value', 'percentage'
  const [sortDirection, setSortDirection] = useState('desc') // 'asc' or 'desc'

  // Load assets from localStorage on mount
  useEffect(() => {
    try {
      const savedAssets = localStorage.getItem('portfolioAssets')
      if (savedAssets) {
        const parsed = JSON.parse(savedAssets)
        // Ensure it's an array
        if (Array.isArray(parsed)) {
          setAssets(parsed)
        } else {
          console.error('Invalid assets data in localStorage:', parsed)
        }
      }
    } catch (error) {
      console.error('Error loading assets from localStorage:', error)
    }
  }, [])

  // Save assets to localStorage whenever assets change (but not on initial empty load)
  const isInitialMount = useRef(true)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return // Skip saving on initial mount
    }
    
    try {
      localStorage.setItem('portfolioAssets', JSON.stringify(assets))
    } catch (error) {
      console.error('Error saving assets to localStorage:', error)
    }
  }, [assets])

  const addAsset = async (e) => {
    e.preventDefault()
    setError('')
    
    // Handle cash addition
    if (isCash) {
      const amount = parseFloat(cashAmount)
      if (amount > 0) {
        setAssets(prevAssets => [...prevAssets, {
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
    
    // Handle manual asset addition
    if (isManualAsset) {
      const assetName = manualAssetName.trim()
      const assetValue = parseFloat(manualAssetValue)
      
      if (!assetName) {
        setError('Asset name is required')
        return
      }
      
      if (assetValue <= 0) {
        setError('Asset value must be greater than 0')
        return
      }
      
      setAssets(prevAssets => [...prevAssets, {
        id: Date.now(),
        ticker: assetName.toUpperCase(),
        name: assetName,
        shares: 1,
        price: assetValue,
        value: assetValue,
        isManualAsset: true
      }])
      setManualAssetName('')
      setManualAssetValue('')
      setIsManualAsset(false)
      return
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
        
        setAssets(prevAssets => [...prevAssets, {
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

  const refreshAllPrices = async () => {
    setLoading(true)
    setError('')
    
    // Get all assets that have tickers and can be refreshed
    const assetsToRefresh = assets.filter(asset => 
      asset.ticker && 
      !asset.isCash && 
      !asset.isManualAsset && 
      asset.shares
    )
    
    if (assetsToRefresh.length === 0) {
      setError('No assets available to refresh')
      setLoading(false)
      return
    }
    
    try {
      // Refresh prices for all assets in parallel
      const refreshPromises = assetsToRefresh.map(async (asset) => {
        try {
          const price = await fetchStockPrice(asset.ticker)
          return { id: asset.id, price, success: true }
        } catch (err) {
          return { id: asset.id, ticker: asset.ticker, success: false, error: err.message }
        }
      })
      
      const results = await Promise.all(refreshPromises)
      
      // Update assets with new prices
      setAssets(prevAssets => prevAssets.map(asset => {
        const result = results.find(r => r.id === asset.id)
        if (result && result.success && asset.shares) {
          return { ...asset, price: result.price, value: asset.shares * result.price }
        }
        return asset
      }))
      
      // Show errors if any failed
      const failed = results.filter(r => !r.success)
      if (failed.length > 0) {
        const failedTickers = failed.map(f => f.ticker).join(', ')
        setError(`Failed to refresh: ${failedTickers}`)
      }
    } catch (err) {
      setError('Error refreshing prices: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const startEdit = (asset) => {
    setEditingId(asset.id)
    if (asset.isCash) {
      setEditPrice(asset.value ? asset.value.toString() : '')
      setEditShares('')
    } else if (asset.isManualAsset) {
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
    } else if (asset.isManualAsset) {
      // For manual assets, just update the value
      const newValue = parseFloat(editPrice)
      if (newValue <= 0) {
        setError('Asset value must be greater than 0')
        return
      }
      
      setAssets(prevAssets => prevAssets.map(a => {
        if (a.id === editingId) {
          return {
            ...a,
            price: newValue,
            value: newValue
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
    // For manual assets, use the name; for others, use ticker
    const tickerName = asset.isManualAsset ? (asset.name || asset.ticker) : (asset.ticker || asset.name || 'Unknown')
    const existing = acc.find(item => item.name === tickerName)
    if (existing) {
      existing.value += asset.value
      // Sum up shares (only for non-cash, non-manual assets)
      if (!asset.isCash && !asset.isManualAsset && asset.shares && asset.price) {
        const oldShares = existing.shares || 0
        const oldTotalValue = oldShares * (existing.avgPrice || 0)
        const newShares = asset.shares
        const newTotalValue = newShares * asset.price
        
        existing.shares = oldShares + newShares
        // Calculate weighted average price
        existing.avgPrice = existing.shares > 0 ? (oldTotalValue + newTotalValue) / existing.shares : asset.price
      }
    } else {
      acc.push({ 
        name: tickerName, 
        value: asset.value,
        shares: (!asset.isCash && !asset.isManualAsset && asset.shares) ? asset.shares : null,
        avgPrice: (!asset.isCash && !asset.isManualAsset && asset.price) ? asset.price : null
      })
    }
    return acc
  }, [])

  // Calculate percentages
  const tickerDataWithPercentage = tickerData.map(item => ({
    ...item,
    percentage: totalValue > 0 ? ((item.value / totalValue) * 100).toFixed(1) : 0
  }))

  // Handle column sorting
  const handleSort = (column) => {
    if (sortColumn === column) {
      // Toggle direction if clicking the same column
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      // Set new column and default to descending
      setSortColumn(column)
      setSortDirection('desc')
    }
  }

  // Sort the data based on selected column and direction
  const sortedTickerData = [...tickerDataWithPercentage].sort((a, b) => {
    let aValue, bValue

    switch (sortColumn) {
      case 'ticker':
        aValue = a.name.toLowerCase()
        bValue = b.name.toLowerCase()
        break
      case 'shares':
        aValue = a.shares !== null && a.shares !== undefined ? a.shares : -1
        bValue = b.shares !== null && b.shares !== undefined ? b.shares : -1
        break
      case 'value':
        aValue = a.value
        bValue = b.value
        break
      case 'percentage':
        aValue = parseFloat(a.percentage)
        bValue = parseFloat(b.percentage)
        break
      default:
        return 0
    }

    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
    return 0
  })

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
                <div className="space-y-2 pb-2 border-b border-gray-200">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="isCash"
                      checked={isCash}
                      onChange={(e) => {
                        setIsCash(e.target.checked)
                        setIsManualAsset(false)
                        setTicker('')
                        setShares('')
                        setCashAmount('')
                        setManualAssetName('')
                        setManualAssetValue('')
                        setError('')
                      }}
                      className="mr-2"
                      disabled={loading}
                    />
                    <label htmlFor="isCash" className="text-sm font-medium text-gray-700">
                      Add Cash
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="isManualAsset"
                      checked={isManualAsset}
                      onChange={(e) => {
                        setIsManualAsset(e.target.checked)
                        setIsCash(false)
                        setTicker('')
                        setShares('')
                        setCashAmount('')
                        setManualAssetName('')
                        setManualAssetValue('')
                        setError('')
                      }}
                      className="mr-2"
                      disabled={loading}
                    />
                    <label htmlFor="isManualAsset" className="text-sm font-medium text-gray-700">
                      Add Manual Asset (Not on Public Markets)
                    </label>
                  </div>
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
                ) : isManualAsset ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Asset Name
                      </label>
                      <input
                        type="text"
                        value={manualAssetName}
                        onChange={(e) => setManualAssetName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., Private Equity, Real Estate, Art Collection"
                        required
                        disabled={loading}
                      />
                      <p className="text-xs text-gray-500 mt-1">Enter a name for your asset</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Total Value ($)
                      </label>
                      <input
                        type="number"
                        value={manualAssetValue}
                        onChange={(e) => setManualAssetValue(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="50000"
                        min="0"
                        step="0.01"
                        required
                        disabled={loading}
                      />
                      <p className="text-xs text-gray-500 mt-1">Enter the total current value</p>
                    </div>
                  </>
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
                        required={!isCash && !isManualAsset}
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
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-semibold text-gray-800">Your Assets</h2>
                {assets.filter(a => a.ticker && !a.isCash && !a.isManualAsset).length > 0 && (
                  <button
                    onClick={refreshAllPrices}
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors font-medium disabled:bg-blue-400 disabled:cursor-not-allowed"
                    title="Refresh all stock and crypto prices"
                  >
                    {loading ? 'Refreshing...' : 'Refresh All Prices'}
                  </button>
                )}
              </div>
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
                          ) : asset.isManualAsset ? (
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Total Value ($)</label>
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
                              {asset.isCash ? '💵 Cash' : asset.isManualAsset ? `📦 ${asset.name || asset.ticker}` : (asset.ticker || asset.name)}
                            </div>
                            {!asset.isCash && !asset.isManualAsset && (
                              <div className="text-sm text-gray-600">
                                {asset.shares ? `${asset.shares} shares` : ''} {asset.price ? `@ $${asset.price.toFixed(2)}` : ''}
                              </div>
                            )}
                            {asset.isManualAsset && (
                              <div className="text-sm text-gray-600">
                                Manual Asset
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
                            {asset.ticker && !asset.isManualAsset && (
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
                        <th 
                          className="text-left py-3 px-4 font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none"
                          onClick={() => handleSort('ticker')}
                        >
                          <div className="flex items-center">
                            Ticker
                            {sortColumn === 'ticker' && (
                              <span className="ml-2 text-blue-600">
                                {sortDirection === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </div>
                        </th>
                        <th 
                          className="text-right py-3 px-4 font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none"
                          onClick={() => handleSort('shares')}
                        >
                          <div className="flex items-center justify-end">
                            Shares
                            {sortColumn === 'shares' && (
                              <span className="ml-2 text-blue-600">
                                {sortDirection === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </div>
                        </th>
                        <th 
                          className="text-right py-3 px-4 font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none"
                          onClick={() => handleSort('price')}
                        >
                          <div className="flex items-center justify-end">
                            Per Share Price
                            {sortColumn === 'price' && (
                              <span className="ml-2 text-blue-600">
                                {sortDirection === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </div>
                        </th>
                        <th 
                          className="text-right py-3 px-4 font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none"
                          onClick={() => handleSort('value')}
                        >
                          <div className="flex items-center justify-end">
                            Value
                            {sortColumn === 'value' && (
                              <span className="ml-2 text-blue-600">
                                {sortDirection === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </div>
                        </th>
                        <th 
                          className="text-right py-3 px-4 font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none"
                          onClick={() => handleSort('percentage')}
                        >
                          <div className="flex items-center justify-end">
                            Percentage
                            {sortColumn === 'percentage' && (
                              <span className="ml-2 text-blue-600">
                                {sortDirection === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTickerData.map((item, index) => (
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
                              {item.shares !== null && item.shares !== undefined 
                                ? item.shares.toLocaleString('en-US', { maximumFractionDigits: 4 })
                                : '—'}
                            </td>
                            <td className="py-3 px-4 text-right text-gray-700">
                              {item.avgPrice !== null && item.avgPrice !== undefined 
                                ? `$${item.avgPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                : '—'}
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

