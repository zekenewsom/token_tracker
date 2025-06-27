
const AnalysisService = require('../services/analysisService');
const logger = require('../utils/logger');

class AnalysisController {
    /**
     * Handles the request to get holder analysis data.
     */
    static async getHolderAnalysis(req, res) {
        try {
            const analysisData = await AnalysisService.calculateHolderMetrics();
            res.status(200).json(analysisData);
        } catch (error) {
            logger.log(`Error fetching holder analysis: ${error.message}`);
            res.status(500).json({ message: 'Internal Server Error' });
        }
    }
}

module.exports = AnalysisController;
