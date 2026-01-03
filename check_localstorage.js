// Check what's in localStorage
console.log("Checking localStorage...");
if (typeof window !== 'undefined' && window.localStorage) {
  const data = localStorage.getItem('portfolioAssets');
  console.log("portfolioAssets:", data);
  if (data) {
    try {
      const parsed = JSON.parse(data);
      console.log("Parsed assets:", parsed);
      console.log("Number of assets:", parsed.length);
    } catch (e) {
      console.log("Error parsing:", e);
    }
  }
}
