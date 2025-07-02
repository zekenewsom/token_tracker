const { calculateAverageCostBasis } = require('../services/calculationService');

async function testFix() {
    console.log('Testing the fixed calculation service...\n');
    
    try {
        await calculateAverageCostBasis();
        console.log('\n✅ Calculation completed successfully!');
    } catch (error) {
        console.error('❌ Error during calculation:', error);
    }
}

testFix().catch(console.error);