const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting variables
let requestCount = 0;
let lastResetTime = Date.now();
const MAX_REQUESTS_PER_MINUTE = 10;

// Helper function to delay requests
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Rate limiting middleware
app.use((req, res, next) => {
    const now = Date.now();
    const timePassed = now - lastResetTime;
    
    if (timePassed > 60000) {
        requestCount = 0;
        lastResetTime = now;
    }
    
    if (requestCount >= MAX_REQUESTS_PER_MINUTE) {
        const waitTime = 60000 - timePassed;
        console.log(`⏳ Rate limit exceeded. Waiting ${Math.ceil(waitTime/1000)} seconds...`);
        return res.status(429).json({
            error: 'Rate limit exceeded',
            message: 'Too many requests to Roblox API. Please try again in a minute.',
            retryAfter: Math.ceil(waitTime/1000)
        });
    }
    
    requestCount++;
    next();
});

// Search Roblox catalog
app.get('/api/search', async (req, res) => {
    try {
        const { query, category = 'All', limit = 30 } = req.query;
        
        if (!query || query.trim() === '') {
            return res.status(400).json({ 
                error: 'Search query is required' 
            });
        }

        console.log('🔍 Searching Roblox catalog for:', query, `(Request ${requestCount}/${MAX_REQUESTS_PER_MINUTE})`);
        
        await delay(2000);
        
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
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response.data.data) {
            return res.json([]);
        }
        
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
        console.error('❌ Search error:', error.response?.status, error.response?.data || error.message);
        
        if (error.response?.status === 429) {
            return res.status(429).json({ 
                error: 'Roblox API rate limit exceeded',
                message: 'The Roblox API is temporarily rate limiting us. Please wait a minute and try again.'
            });
        }
        
        res.status(500).json({ 
            error: 'Failed to search catalog',
            details: error.message 
        });
    }
});

// Get item details by asset ID - FIXED ENDPOINT
app.get('/api/item/:assetId', async (req, res) => {
    try {
        const { assetId } = req.params;
        
        if (!assetId || isNaN(assetId)) {
            return res.status(400).json({ 
                error: 'Valid asset ID is required' 
            });
        }

        console.log('📦 Getting details for asset ID:', assetId, `(Request ${requestCount}/${MAX_REQUESTS_PER_MINUTE})`);
        
        await delay(2000);
        
        // Use the correct Roblox API endpoint for product info
        const response = await axios.get(
            `https://economy.roblox.com/v2/assets/${assetId}/details`,
            { 
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            }
        );
        
        // Format the response
        const itemData = response.data;
        const formattedItem = {
            assetId: itemData.AssetId,
            name: itemData.Name,
            price: itemData.PriceInRobux || 0,
            description: itemData.Description,
            productId: itemData.ProductId,
            creator: itemData.Creator?.Name || 'Unknown',
            isForSale: itemData.IsForSale || false,
            assetTypeId: itemData.AssetTypeId
        };
        
        res.json(formattedItem);
        
    } catch (error) {
        console.error('❌ Item details error:', error.response?.status, error.response?.data || error.message);
        
        if (error.response?.status === 429) {
            return res.status(429).json({ 
                error: 'Roblox API rate limit exceeded',
                message: 'The Roblox API is temporarily rate limiting us. Please wait a minute and try again.'
            });
        }
        
        if (error.response?.status === 400) {
            return res.status(404).json({ 
                error: 'Item not found or invalid asset ID',
                message: 'The item you\'re looking for doesn\'t exist or the asset ID is invalid.'
            });
        }
        
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

// Alternative item details endpoint (using catalog API)
app.get('/api/item-catalog/:assetId', async (req, res) => {
    try {
        const { assetId } = req.params;
        
        if (!assetId || isNaN(assetId)) {
            return res.status(400).json({ 
                error: 'Valid asset ID is required' 
            });
        }

        console.log('📦 Getting catalog details for asset ID:', assetId);
        
        await delay(2000);
        
        // Alternative endpoint using catalog API
        const response = await axios.get(
            `https://catalog.roblox.com/v1/catalog/items/${assetId}/details`,
            { 
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            }
        );
        
        res.json(response.data);
        
    } catch (error) {
        console.error('❌ Catalog item details error:', error.response?.status, error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Failed to get catalog item details',
            details: error.message 
        });
    }
});

// Get popular items
app.get('/api/popular', async (req, res) => {
    try {
        console.log('🔥 Getting popular items...', `(Request ${requestCount}/${MAX_REQUESTS_PER_MINUTE})`);
        
        await delay(2000);
        
        const response = await axios.get(
            `https://catalog.roblox.com/v1/search/items/details`, {
            params: {
                Category: 'All',
                Limit: 30,
                SortType: 'Popular'
            },
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
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
        console.error('❌ Popular items error:', error.response?.status, error.response?.data || error.message);
        
        if (error.response?.status === 429) {
            return res.status(429).json({ 
                error: 'Roblox API rate limit exceeded',
                message: 'The Roblox API is temporarily rate limiting us. Please wait a minute and try again.'
            });
        }
        
        res.status(500).json({ 
            error: 'Failed to get popular items',
            details: error.message 
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: '✅ OK',
        message: 'Roblox Catalog Proxy is running on Render!',
        rateLimit: `${requestCount}/${MAX_REQUESTS_PER_MINUTE} requests this minute`,
        timestamp: new Date().toISOString()
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({ 
        message: '🎮 Roblox Catalog Proxy Server',
        version: '2.0.0',
        deployed: 'Render.com',
        rateLimit: '10 requests per minute to avoid Roblox API limits',
        endpoints: {
            search: 'GET /api/search?query=YOUR_QUERY&limit=30',
            itemDetails: 'GET /api/item/:assetId',
            itemCatalog: 'GET /api/item-catalog/:assetId (alternative)',
            popular: 'GET /api/popular',
            health: 'GET /health'
        },
        examples: {
            search: '/api/search?query=hat&limit=30',
            itemDetails: '/api/item/102611803 (Classic T-Shirt)',
            itemCatalog: '/api/item-catalog/102611803',
            popular: '/api/popular'
        }
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
    console.log(`🚀 Roblox Catalog Proxy Server running on port ${PORT}`);
    console.log(`📊 Rate limit: ${MAX_REQUESTS_PER_MINUTE} requests per minute`);
    console.log(`✅ Fixed item details endpoint using economy API`);
});

module.exports = app;
