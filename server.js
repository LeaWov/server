const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Cache system
const searchCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Search with categories
app.get('/api/search', async (req, res) => {
    try {
        const { query, category = 'All', sort = 'Relevance', limit = 30 } = req.query;
        
        // Check cache first
        const cacheKey = `${query}-${category}-${sort}-${limit}`.toLowerCase();
        const cached = searchCache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            console.log(`📦 Serving from cache: ${query}`);
            return res.json(cached.data);
        }

        console.log('🔍 Searching:', query, 'Category:', category, 'Sort:', sort);
        
        // Wait 3 seconds between requests to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const response = await axios.get(
            `https://catalog.roblox.com/v1/search/items/details`, {
            params: {
                Keyword: query || '',
                Category: category,
                Limit: 30, // Roblox only allows 10, 28, or 30
                SortType: sort
            },
            timeout: 15000
        });

        if (!response.data.data) {
            return res.json([]);
        }
        
        // Get accurate prices for each item
        const itemsWithAccuratePrices = await Promise.all(
            response.data.data.map(async (item) => {
                try {
                    // Get detailed product info for accurate pricing
                    const productResponse = await axios.get(
                        `https://economy.roblox.com/v2/assets/${item.id}/details`,
                        { timeout: 10000 }
                    );
                    
                    return {
                        assetId: item.id,
                        name: item.name,
                        price: productResponse.data.PriceInRobux || item.price || 0,
                        description: item.description,
                        productId: item.productId,
                        assetTypeId: item.assetTypeId,
                        creator: item.creatorName,
                        isForSale: item.isForSale || false,
                        itemType: getItemType(item.assetTypeId)
                    };
                } catch (error) {
                    // Fallback to basic info if detailed request fails
                    return {
                        assetId: item.id,
                        name: item.name,
                        price: item.price || 0,
                        description: item.description,
                        productId: item.productId,
                        assetTypeId: item.assetTypeId,
                        creator: item.creatorName,
                        isForSale: item.isForSale || false,
                        itemType: getItemType(item.assetTypeId)
                    };
                }
            })
        );

        // Cache the results
        searchCache.set(cacheKey, {
            data: itemsWithAccuratePrices,
            timestamp: Date.now()
        });

        console.log(`✅ Found ${itemsWithAccuratePrices.length} items`);
        
        res.json(itemsWithAccuratePrices);
        
    } catch (error) {
        console.error('❌ Search error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Failed to search catalog',
            details: error.message 
        });
    }
});

// Get item type from assetTypeId
function getItemType(assetTypeId) {
    const types = {
        2: 'TShirt',
        11: 'Shirt',
        12: 'Pants',
        17: 'Head',
        18: 'Face',
        19: 'Gear',
        27: 'Hair',
        28: 'Hat',
        29: 'Package',
        30: 'Bundle'
    };
    return types[assetTypeId] || 'Unknown';
}

// Get popular items by category
app.get('/api/popular/:category', async (req, res) => {
    try {
        const { category } = req.params;
        
        const response = await axios.get(
            `https://catalog.roblox.com/v1/search/items/details`, {
            params: {
                Category: category,
                Limit: 30,
                SortType: 'Popular'
            },
            timeout: 15000
        });

        if (!response.data.data) {
            return res.json([]);
        }
        
        const formattedResults = response.data.data.map(item => ({
            assetId: item.id,
            name: item.name,
            price: item.price || 0,
            description: item.description,
            creator: item.creatorName,
            itemType: getItemType(item.assetTypeId)
        }));

        res.json(formattedResults);
        
    } catch (error) {
        console.error('❌ Popular items error:', error);
        res.status(500).json({ error: 'Failed to get popular items' });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: '✅ OK',
        message: 'Enhanced Catalog Proxy is running!',
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Enhanced Catalog Proxy running on port ${PORT}`);
});
