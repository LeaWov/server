const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Helper function to delay requests (avoid rate limiting)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Search Roblox catalog
app.get('/api/search', async (req, res) => {
    try {
        const { query, category = 'All', limit = 30 } = req.query;
        
        if (!query || query.trim() === '') {
            return res.status(400).json({ 
                error: 'Search query is required' 
            });
        }

        console.log('🔍 Searching Roblox catalog for:', query);
        
        // Add small delay to avoid rate limiting
        await delay(100);
        
        // Roblox API only allows specific limit values: 10, 28, or 30
        let allowedLimit = 30;
        const requestedLimit = parseInt(limit);
        if ([10, 28, 30].includes(requestedLimit)) {
            allowedLimit = requestedLimit;
        }
        
        const response = await axios.get(
            `https://catalog.roblox.com/v1/search/items/details`, {
            params: {
                Keyword: query.trim(),
                Category: category,
                Limit: allowedLimit,
                SortType: 'Relevance'
            },
            timeout: 10000 // 10 second timeout
        });

        if (!response.data.data) {
            return res.json([]);
        }
        
        // Format the response for Roblox
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

        console.log(`✅ Found ${formattedResults.length} items for "${query}"`);
        
        res.json(formattedResults);
        
    } catch (error) {
        console.error('❌ Search error:', error.response?.data || error.message);
        
        if (error.code === 'ECONNABORTED') {
            return res.status(408).json({ 
                error: 'Request timeout - Roblox API is slow to respond' 
            });
        }
        
        res.status(500).json({ 
            error: 'Failed to search catalog',
            details: error.message 
        });
    }
});

// Get item details by asset ID
app.get('/api/item/:assetId', async (req, res) => {
    try {
        const { assetId } = req.params;
        
        if (!assetId || isNaN(assetId)) {
            return res.status(400).json({ 
                error: 'Valid asset ID is required' 
            });
        }

        console.log('📦 Getting details for asset ID:', assetId);
        
        await delay(100);
        
        const response = await axios.get(
            `https://catalog.roblox.com/v1/catalog/items/${assetId}/details`,
            { timeout: 10000 }
        );
        
        res.json(response.data);
        
    } catch (error) {
        console.error('❌ Item details error:', error.response?.data || error.message);
        
        if (error.response?.status === 404) {
            return res.status(404).json({ 
                error: 'Item not found' 
            });
        }
        
        res.status(500).json({ 
            error: 'Failed to get item details',
            details: error.message 
        });
    }
});

// Get popular items (fallback when no search query)
app.get('/api/popular', async (req, res) => {
    try {
        console.log('🔥 Getting popular items...');
        
        await delay(100);
        
        const response = await axios.get(
            `https://catalog.roblox.com/v1/search/items/details`, {
            params: {
                Category: 'All',
                Limit: 30, // Fixed to allowed value
                SortType: 'Popular'
            },
            timeout: 10000
        });

        if (!response.data.data) {
            return res.json([]);
        }
        
        const formattedResults = response.data.data.map(item => ({
            assetId: item.id,
            name: item.name,
            price: item.price || 0,
            description: item.description,
            creator: item.creatorName
        }));

        console.log(`✅ Found ${formattedResults.length} popular items`);
        
        res.json(formattedResults);
        
    } catch (error) {
        console.error('❌ Popular items error:', error);
        res.status(500).json({ 
            error: 'Failed to get popular items',
            details: error.message 
        });
    }
});

// Get items by category
app.get('/api/category/:category', async (req, res) => {
    try {
        const { category } = req.params;
        const { limit = 30 } = req.query;
        
        console.log('📂 Getting items for category:', category);
        
        await delay(100);
        
        // Roblox API only allows specific limit values: 10, 28, or 30
        let allowedLimit = 30;
        const requestedLimit = parseInt(limit);
        if ([10, 28, 30].includes(requestedLimit)) {
            allowedLimit = requestedLimit;
        }
        
        const response = await axios.get(
            `https://catalog.roblox.com/v1/search/items/details`, {
            params: {
                Category: category,
                Limit: allowedLimit,
                SortType: 'Popular'
            },
            timeout: 10000
        });

        if (!response.data.data) {
            return res.json([]);
        }
        
        const formattedResults = response.data.data.map(item => ({
            assetId: item.id,
            name: item.name,
            price: item.price || 0,
            description: item.description
        }));

        console.log(`✅ Found ${formattedResults.length} items in ${category}`);
        
        res.json(formattedResults);
        
    } catch (error) {
        console.error('❌ Category error:', error);
        res.status(500).json({ 
            error: 'Failed to get category items',
            details: error.message 
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: '✅ OK',
        message: 'Roblox Catalog Proxy is running!',
        timestamp: new Date().toISOString()
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({ 
        message: '🎮 Roblox Catalog Proxy Server',
        version: '1.0.0',
        endpoints: {
            search: 'GET /api/search?query=YOUR_QUERY&limit=30',
            itemDetails: 'GET /api/item/:assetId',
            popular: 'GET /api/popular',
            category: 'GET /api/category/:category',
            health: 'GET /health'
        },
        examples: {
            search: 'http://localhost:3000/api/search?query=hat&limit=30',
            itemDetails: 'http://localhost:3000/api/item/102611803',
            popular: 'http://localhost:3000/api/popular'
        },
        note: 'Limit parameter only accepts: 10, 28, or 30'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Endpoint not found',
        availableEndpoints: {
            search: '/api/search?query=YOUR_QUERY&limit=30',
            itemDetails: '/api/item/:assetId',
            popular: '/api/popular',
            health: '/health'
        }
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`\n🚀 Roblox Catalog Proxy Server started!`);
    console.log(`📡 Local: http://localhost:${PORT}`);
    console.log(`🌐 Network: http://YOUR_IP:${PORT}`);
    console.log(`\n📚 Available endpoints:`);
    console.log(`   🔍 Search: http://localhost:${PORT}/api/search?query=hat&limit=30`);
    console.log(`   📦 Item Details: http://localhost:${PORT}/api/item/102611803`);
    console.log(`   🔥 Popular: http://localhost:${PORT}/api/popular`);
    console.log(`   ❤️  Health: http://localhost:${PORT}/health`);
    console.log(`\n💡 Tip: Test the server by visiting the links above in your browser!`);
    console.log(`📝 Note: Limit parameter only accepts: 10, 28, or 30\n`);
});

module.exports = app;