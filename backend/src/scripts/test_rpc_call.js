const axios = require('axios');
const { PublicKey } = require('@solana/web3.js');

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const MINT_ADDRESS = '2mhszy8YHwqs1fxruVHQQAUmNcfq31mtkmYYtNZNpump';

async function findAssociatedTokenAddress(walletAddress, tokenMintAddress) {
    const [ata] = await PublicKey.findProgramAddress(
        [
            new PublicKey(walletAddress).toBuffer(),
            TOKEN_PROGRAM_ID.toBuffer(),
            new PublicKey(tokenMintAddress).toBuffer(),
        ],
        ASSOCIATED_TOKEN_PROGRAM_ID
    );
    return ata.toBase58();
}

async function testRpcCall() {
    const walletAddress = 'FQr9cK4dzHwdyGVm5M4pjN3VnPwf3W8b6Z1cskUDLQLC';
    const ata = await findAssociatedTokenAddress(walletAddress, MINT_ADDRESS);
    
    console.log(`Testing RPC call for wallet: ${walletAddress}`);
    console.log(`Associated Token Account: ${ata}`);
    
    try {
        const response = await axios.post('https://api.mainnet-beta.solana.com', {
            jsonrpc: '2.0',
            id: 1,
            method: 'getSignaturesForAddress',
            params: [ata, { limit: 1000 }],
        });
        
        console.log('RPC Response Status:', response.status);
        console.log('Headers:', response.headers);
        
        if (response.data.error) {
            console.error('RPC Error:', response.data.error);
        } else {
            console.log('Success! Signatures found:', response.data.result?.length || 0);
            if (response.data.result?.length > 0) {
                console.log('First few signatures:');
                response.data.result.slice(0, 3).forEach((sig, i) => {
                    console.log(`  ${i + 1}. ${sig.signature} (${new Date(sig.blockTime * 1000).toISOString()})`);
                });
            }
        }
        
    } catch (error) {
        console.error('Request failed:', error.response?.status, error.message);
        if (error.response?.headers) {
            console.log('Error headers:', error.response.headers);
        }
    }
}

testRpcCall().catch(console.error);