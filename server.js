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

// Search with categories and pagination
app.get('/api/search', async (req, res) => {
    try {
        const { query, category = 'All', sort = 'Relevance', cursor = '' } = req.query;
        
        console.log('🔍 Search request:', { query, category, sort, cursor });
        
        // Check cache first
        const cacheKey = `${query}-${category}-${sort}-${cursor}`.toLowerCase();
        const cached = searchCache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            console.log(`📦 Serving from cache: ${query}`);
            return res.json(cached.data);
        }

        // Wait 3 seconds between requests
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const params = {
            Category: category,
            Limit: 30,
            SortType: sort
        };
        
        if (query && query.trim() !== '') {
            params.Keyword = query.trim();
        }
        
        if (cursor && cursor !== '') {
            params.cursor = cursor;
        }
        
        console.log('🌐 Calling Roblox API with params:', params);
        
        const response = await axios.get(
            `https://catalog.roblox.com/v1/search/items/details`, {
            params: params,
            timeout: 15000
        });

        console.log('✅ Roblox API response received');
        
        if (!response.data || !response.data.data) {
            console.log('⚠️ No data in response');
            return res.json({ items: [], nextCursor: null });
        }
        
        console.log(`📦 Found ${response.data.data.length} items`);
        
        // Format the response
        const formattedResults = response.data.data.map(item => ({
            assetId: item.id,
            name: item.name,
            price: item.price || 0,
            description: item.description,
            productId: item.productId,
            assetTypeId: item.assetTypeId,
            creator: item.creatorName,
            isForSale: item.isForSale || false
        }));

        const result = {
            items: formattedResults,
            nextCursor: response.data.nextPageCursor || null
        };

        // Cache the results
        searchCache.set(cacheKey, {
            data: result,
            timestamp: Date.now()
        });

        res.json(result);
        
    } catch (error) {
        console.error('❌ Search error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Failed to search catalog',
            details: error.message 
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: '✅ OK',
        message: 'Catalog Proxy is running!',
        timestamp: new Date().toISOString()
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({ 
        message: '🎮 Roblox Catalog Proxy Server',
        version: '1.0.0',
        endpoints: {
            search: 'GET /api/search?query=YOUR_QUERY&category=All&sort=Relevance',
            health: 'GET /health'
        }
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Endpoint not found',
        availableEndpoints: {
            search: '/api/search?query=YOUR_QUERY',
            health: '/health'
        }
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Catalog Proxy running on port ${PORT}`);
});
