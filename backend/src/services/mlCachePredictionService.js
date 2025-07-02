// Lazy load TensorFlow to avoid startup issues
let tf = null;
let Matrix = null;

try {
    tf = require('@tensorflow/tfjs-node');
    const mlMatrix = require('ml-matrix');
    Matrix = mlMatrix.Matrix;
} catch (error) {
    console.warn('[ML-CACHE] TensorFlow.js not available, using fallback mode:', error.message);
}
const redisCache = require('./redisCacheService');
const databaseCache = require('./databaseCacheService');
const changeDetection = require('./changeDetectionService');
const prisma = require('../utils/prismaClient');

class MLCachePredictionService {
    constructor() {
        this.model = null;
        this.isTraining = false;
        this.lastTrainingTime = null;
        this.predictionAccuracy = new Map();
        this.featureExtractors = new Map();
        this.trainingData = [];
        this.modelMetrics = {
            accuracy: 0,
            loss: 0,
            predictions_made: 0,
            correct_predictions: 0
        };
        
        // Feature engineering parameters
        this.features = {
            TIME_BASED: ['hour_of_day', 'day_of_week', 'day_of_month'],
            ACCESS_BASED: ['hit_count', 'miss_count', 'access_frequency'],
            PATTERN_BASED: ['recent_trend', 'seasonal_pattern', 'volatility'],
            CONTEXT_BASED: ['cache_tier', 'data_type', 'user_session']
        };
        
        this.initializeModel();
    }
    
    /**
     * Initialize TensorFlow model for cache prediction
     */
    async initializeModel() {
        try {
            console.log('[ML-CACHE] Initializing machine learning model...');
            
            // Try to load existing model
            await this.loadExistingModel();
            
            if (!this.model) {
                // Create new model if none exists
                await this.createNewModel();
            }
            
            console.log('[ML-CACHE] ML model initialized successfully');
            
        } catch (error) {
            console.warn(`[ML-CACHE] Failed to initialize ML model: ${error.message}`);
            console.log('[ML-CACHE] Falling back to rule-based prediction');
        }
    }
    
    /**
     * Create a new neural network model for cache prediction
     */
    async createNewModel() {
        if (!tf) {
            console.log('[ML-CACHE] TensorFlow.js not available, ML features disabled');
            return;
        }
        
        try {
            // Define model architecture
            const model = tf.sequential({
                layers: [
                    // Input layer - features from cache access patterns
                    tf.layers.dense({
                        inputShape: [12], // 12 input features
                        units: 64,
                        activation: 'relu',
                        name: 'input_layer'
                    }),
                    
                    // Hidden layers for pattern recognition
                    tf.layers.dropout({ rate: 0.2 }),
                    tf.layers.dense({
                        units: 32,
                        activation: 'relu',
                        name: 'hidden_layer_1'
                    }),
                    
                    tf.layers.dropout({ rate: 0.1 }),
                    tf.layers.dense({
                        units: 16,
                        activation: 'relu',
                        name: 'hidden_layer_2'
                    }),
                    
                    // Output layer - probability of cache hit
                    tf.layers.dense({
                        units: 1,
                        activation: 'sigmoid',
                        name: 'output_layer'
                    })
                ]
            });
            
            // Compile model
            model.compile({
                optimizer: tf.train.adam(0.001),
                loss: 'binaryCrossentropy',
                metrics: ['accuracy']
            });
            
            this.model = model;
            console.log('[ML-CACHE] Created new neural network model');
            
            // Print model summary
            this.model.summary();
            
        } catch (error) {
            console.error(`[ML-CACHE] Error creating model: ${error.message}`);
        }
    }
    
    /**
     * Load existing trained model from disk
     */
    async loadExistingModel() {
        try {
            const modelPath = 'file://./ml_models/cache_prediction_model';
            this.model = await tf.loadLayersModel(modelPath);
            console.log('[ML-CACHE] Loaded existing trained model');
        } catch (error) {
            console.log('[ML-CACHE] No existing model found, will create new one');
        }
    }
    
    /**
     * Save trained model to disk
     */
    async saveModel() {
        if (!this.model) return;
        
        try {
            const modelPath = 'file://./ml_models/cache_prediction_model';
            await this.model.save(modelPath);
            console.log('[ML-CACHE] Model saved successfully');
        } catch (error) {
            console.error(`[ML-CACHE] Error saving model: ${error.message}`);
        }
    }
    
    /**
     * Extract features from cache access data
     */
    extractFeatures(accessData) {
        const now = new Date();
        const features = [];
        
        // Time-based features
        features.push(now.getHours() / 24.0); // hour_of_day (normalized)
        features.push(now.getDay() / 7.0); // day_of_week (normalized)
        features.push(now.getDate() / 31.0); // day_of_month (normalized)
        
        // Access pattern features
        const hitCount = accessData.hits || 0;
        const missCount = accessData.misses || 0;
        const totalAccess = hitCount + missCount;
        
        features.push(Math.min(hitCount / 100.0, 1.0)); // hit_count (normalized)
        features.push(Math.min(missCount / 100.0, 1.0)); // miss_count (normalized)
        features.push(totalAccess > 0 ? hitCount / totalAccess : 0); // hit_rate
        
        // Recency features
        const lastAccess = accessData.last_access || 0;
        const ageHours = lastAccess > 0 ? (Date.now() - lastAccess) / (1000 * 60 * 60) : 24;
        features.push(Math.min(ageHours / 24.0, 1.0)); // age_in_days (normalized)
        
        // Pattern features
        features.push(accessData.trend || 0.5); // recent_trend
        features.push(accessData.seasonal || 0.5); // seasonal_pattern
        features.push(accessData.volatility || 0.5); // access_volatility
        
        // Context features
        const tierMap = { 'HOT': 1.0, 'WARM': 0.75, 'COLD': 0.5, 'FREEZE': 0.25 };
        features.push(tierMap[accessData.tier] || 0.5); // cache_tier
        features.push(accessData.data_type_score || 0.5); // data_type importance
        
        return features;
    }
    
    /**
     * Predict cache hit probability for a given key
     */
    async predictCacheHit(cacheKey, accessData = {}) {
        if (!this.model || !tf) {
            // Fallback to rule-based prediction
            return this.ruleBasedPrediction(accessData);
        }
        
        try {
            const features = this.extractFeatures(accessData);
            const inputTensor = tf.tensor2d([features], [1, features.length]);
            
            const prediction = this.model.predict(inputTensor);
            const probability = await prediction.data();
            
            // Cleanup tensors
            inputTensor.dispose();
            prediction.dispose();
            
            const hitProbability = probability[0];
            
            // Track prediction for accuracy measurement
            this.modelMetrics.predictions_made++;
            
            console.log(`[ML-CACHE] Predicted cache hit probability for ${cacheKey}: ${(hitProbability * 100).toFixed(1)}%`);
            
            return {
                hit_probability: hitProbability,
                confidence: this.calculateConfidence(features),
                recommendation: this.generateRecommendation(hitProbability, accessData),
                features_used: features.length
            };
            
        } catch (error) {
            console.error(`[ML-CACHE] Prediction error: ${error.message}`);
            return this.ruleBasedPrediction(accessData);
        }
    }
    
    /**
     * Rule-based fallback prediction when ML model unavailable
     */
    ruleBasedPrediction(accessData) {
        const hitCount = accessData.hits || 0;
        const ageHours = accessData.ageHours || 24;
        const tier = accessData.tier || 'WARM';
        
        let probability = 0.5; // Default
        
        // High hit count = higher probability
        if (hitCount > 20) probability += 0.3;
        else if (hitCount > 10) probability += 0.2;
        else if (hitCount > 5) probability += 0.1;
        
        // Recent access = higher probability
        if (ageHours < 1) probability += 0.2;
        else if (ageHours < 6) probability += 0.1;
        else if (ageHours > 12) probability -= 0.2;
        
        // Hot tier = higher probability
        if (tier === 'HOT') probability += 0.2;
        else if (tier === 'WARM') probability += 0.1;
        else if (tier === 'COLD') probability -= 0.1;
        
        probability = Math.max(0, Math.min(1, probability));
        
        return {
            hit_probability: probability,
            confidence: 0.6, // Lower confidence for rule-based
            recommendation: this.generateRecommendation(probability, accessData),
            method: 'rule_based'
        };
    }
    
    /**
     * Calculate confidence score for prediction
     */
    calculateConfidence(features) {
        // Confidence based on feature completeness and model accuracy
        const featureCompleteness = features.filter(f => f !== null && f !== undefined).length / features.length;
        const modelAccuracy = this.modelMetrics.accuracy || 0.5;
        
        return (featureCompleteness * 0.6) + (modelAccuracy * 0.4);
    }
    
    /**
     * Generate cache management recommendation
     */
    generateRecommendation(hitProbability, accessData) {
        if (hitProbability > 0.8) {
            return {
                action: 'promote_to_hot',
                reason: 'High hit probability detected',
                priority: 'high'
            };
        } else if (hitProbability > 0.6) {
            return {
                action: 'keep_in_warm',
                reason: 'Moderate hit probability',
                priority: 'medium'
            };
        } else if (hitProbability < 0.3) {
            return {
                action: 'demote_or_expire',
                reason: 'Low hit probability',
                priority: 'low'
            };
        } else {
            return {
                action: 'monitor',
                reason: 'Uncertain hit probability',
                priority: 'medium'
            };
        }
    }
    
    /**
     * Collect training data from cache access patterns
     */
    async collectTrainingData() {
        try {
            console.log('[ML-CACHE] Collecting training data...');
            
            const accessKeys = await redisCache.redis.keys('access:*');
            const trainingBatch = [];
            
            for (const accessKey of accessKeys.slice(0, 1000)) { // Limit for performance
                const accessData = await redisCache.redis.hgetall(accessKey);
                const features = this.extractFeatures(accessData);
                
                // Determine actual outcome (cache hit/miss)
                const hitRate = parseInt(accessData.hits || 0) / 
                    (parseInt(accessData.hits || 0) + parseInt(accessData.misses || 0) || 1);
                
                const label = hitRate > 0.5 ? 1 : 0; // Binary classification
                
                trainingBatch.push({
                    features,
                    label,
                    key: accessKey.replace('access:', ''),
                    metadata: accessData
                });
            }
            
            this.trainingData.push(...trainingBatch);
            
            // Keep only recent training data (last 10000 samples)
            if (this.trainingData.length > 10000) {
                this.trainingData = this.trainingData.slice(-10000);
            }
            
            console.log(`[ML-CACHE] Collected ${trainingBatch.length} training samples. Total: ${this.trainingData.length}`);
            
        } catch (error) {
            console.error(`[ML-CACHE] Error collecting training data: ${error.message}`);
        }
    }
    
    /**
     * Train the ML model with collected data
     */
    async trainModel() {
        if (this.isTraining || !this.model || !tf || this.trainingData.length < 100) {
            console.log('[ML-CACHE] Skipping training - insufficient data, no TensorFlow, or already training');
            return;
        }
        
        this.isTraining = true;
        console.log(`[ML-CACHE] Starting model training with ${this.trainingData.length} samples...`);
        
        try {
            // Prepare training data
            const features = this.trainingData.map(d => d.features);
            const labels = this.trainingData.map(d => [d.label]);
            
            const xs = tf.tensor2d(features);
            const ys = tf.tensor2d(labels);
            
            // Train model
            const history = await this.model.fit(xs, ys, {
                epochs: 50,
                batchSize: 32,
                validationSplit: 0.2,
                shuffle: true,
                callbacks: {
                    onEpochEnd: (epoch, logs) => {
                        if (epoch % 10 === 0) {
                            console.log(`[ML-CACHE] Epoch ${epoch}: loss = ${logs.loss.toFixed(4)}, accuracy = ${logs.acc.toFixed(4)}`);
                        }
                    }
                }
            });
            
            // Update metrics
            const finalHistory = history.history;
            this.modelMetrics.accuracy = finalHistory.acc[finalHistory.acc.length - 1];
            this.modelMetrics.loss = finalHistory.loss[finalHistory.loss.length - 1];
            this.lastTrainingTime = Date.now();
            
            // Cleanup tensors
            xs.dispose();
            ys.dispose();
            
            // Save trained model
            await this.saveModel();
            
            console.log(`[ML-CACHE] Training completed. Accuracy: ${(this.modelMetrics.accuracy * 100).toFixed(2)}%`);
            
            // Log training completion
            await changeDetection.logApiCall(
                'ml_cache_training',
                'train_model',
                true,
                null,
                null,
                `accuracy_${(this.modelMetrics.accuracy * 100).toFixed(2)}_samples_${this.trainingData.length}`
            );
            
        } catch (error) {
            console.error(`[ML-CACHE] Training error: ${error.message}`);
            
            await changeDetection.logApiCall(
                'ml_cache_training',
                'train_model',
                false,
                null,
                error.message
            );
        } finally {
            this.isTraining = false;
        }
    }
    
    /**
     * Validate prediction accuracy against actual outcomes
     */
    async validatePredictions() {
        try {
            console.log('[ML-CACHE] Validating prediction accuracy...');
            
            const validationKeys = await redisCache.redis.keys('access:*');
            let correctPredictions = 0;
            let totalPredictions = 0;
            
            for (const accessKey of validationKeys.slice(0, 100)) { // Sample validation
                const accessData = await redisCache.redis.hgetall(accessKey);
                const prediction = await this.predictCacheHit(accessKey.replace('access:', ''), accessData);
                
                // Compare with actual hit rate
                const actualHitRate = parseInt(accessData.hits || 0) / 
                    (parseInt(accessData.hits || 0) + parseInt(accessData.misses || 0) || 1);
                
                const predictedHit = prediction.hit_probability > 0.5;
                const actualHit = actualHitRate > 0.5;
                
                if (predictedHit === actualHit) {
                    correctPredictions++;
                }
                totalPredictions++;
            }
            
            const accuracy = totalPredictions > 0 ? correctPredictions / totalPredictions : 0;
            this.modelMetrics.correct_predictions += correctPredictions;
            
            console.log(`[ML-CACHE] Validation accuracy: ${(accuracy * 100).toFixed(2)}% (${correctPredictions}/${totalPredictions})`);
            
            return accuracy;
            
        } catch (error) {
            console.error(`[ML-CACHE] Validation error: ${error.message}`);
            return 0;
        }
    }
    
    /**
     * Generate intelligent cache warming recommendations
     */
    async generateWarmingRecommendations() {
        try {
            console.log('[ML-CACHE] Generating ML-based warming recommendations...');
            
            const recommendations = [];
            const accessKeys = await redisCache.redis.keys('access:*');
            
            for (const accessKey of accessKeys.slice(0, 50)) { // Top 50 candidates
                const accessData = await redisCache.redis.hgetall(accessKey);
                const cacheKey = accessKey.replace('access:', '');
                
                const prediction = await this.predictCacheHit(cacheKey, accessData);
                
                if (prediction.hit_probability > 0.7 && prediction.confidence > 0.6) {
                    recommendations.push({
                        cache_key: cacheKey,
                        hit_probability: prediction.hit_probability,
                        confidence: prediction.confidence,
                        action: prediction.recommendation.action,
                        priority: prediction.recommendation.priority,
                        reason: 'ML prediction indicates high hit probability'
                    });
                }
            }
            
            // Sort by hit probability and confidence
            recommendations.sort((a, b) => 
                (b.hit_probability * b.confidence) - (a.hit_probability * a.confidence)
            );
            
            console.log(`[ML-CACHE] Generated ${recommendations.length} ML-based warming recommendations`);
            
            return recommendations.slice(0, 20); // Top 20 recommendations
            
        } catch (error) {
            console.error(`[ML-CACHE] Error generating recommendations: ${error.message}`);
            return [];
        }
    }
    
    /**
     * Get ML service statistics
     */
    getMLStats() {
        return {
            model_status: {
                initialized: !!this.model,
                is_training: this.isTraining,
                last_training: this.lastTrainingTime,
                training_samples: this.trainingData.length
            },
            performance: {
                accuracy: this.modelMetrics.accuracy,
                loss: this.modelMetrics.loss,
                predictions_made: this.modelMetrics.predictions_made,
                correct_predictions: this.modelMetrics.correct_predictions
            },
            features: {
                feature_count: 12,
                feature_categories: Object.keys(this.features).length,
                extractors: this.featureExtractors.size
            }
        };
    }
    
    /**
     * Cleanup resources and dispose tensors
     */
    async dispose() {
        console.log('[ML-CACHE] Disposing ML resources...');
        
        if (this.model && tf) {
            this.model.dispose();
        }
        
        // Dispose any remaining tensors
        if (tf) {
            tf.disposeVariables();
        }
        
        console.log('[ML-CACHE] ML resources disposed');
    }
}

// Export singleton instance
module.exports = new MLCachePredictionService();