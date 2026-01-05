const fs = require('fs');
const path = require('path');
const https = require('https');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function downloadImage(url, filepath) {
    return new Promise((resolve, reject) => {
        const dir = path.dirname(filepath);
        fs.mkdirSync(dir, { recursive: true });

        const file = fs.createWriteStream(filepath);
        https.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                // Handle redirect
                https.get(response.headers.location, (redirectResponse) => {
                    redirectResponse.pipe(file);
                    file.on('finish', () => {
                        file.close();
                        resolve();
                    });
                }).on('error', (err) => {
                    fs.unlink(filepath, () => {});
                    reject(err);
                });
                return;
            }

            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${url} (${response.statusCode})`));
                return;
            }

            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(filepath, () => {}); // Delete the file on error
            reject(err);
        });
    });
}

async function main() {
    try {
        console.log('=== Albion Online Weapon Asset Downloader ===\n');

        const weaponType = (await question('Enter weapon type (MAIN or 2H): ')).trim().toUpperCase();

        if (weaponType !== 'MAIN' && weaponType !== '2H') {
            console.error('Error: Weapon type must be either MAIN or 2H');
            rl.close();
            return;
        }

        const weaponName = (await question('Enter unique weapon name (e.g., ARCANESTAFF): ')).trim().toUpperCase();

        if (!weaponName) {
            console.error('Error: Weapon name cannot be empty');
            rl.close();
            return;
        }

        const baseDir = path.join('assets', 'albion', 'items', `${weaponType}_${weaponName}`);
        const tiers = [4, 5, 6, 7, 8];
        const enchantments = [0, 1, 2, 3, 4];
        const qualities = [1, 2, 3, 4, 5];

        const totalImages = tiers.length * enchantments.length * qualities.length;

        console.log(`\n📥 Downloading all variants for ${weaponType}_${weaponName}...`);
        console.log(`📊 Total images to download: ${totalImages}`);
        console.log(`📁 Destination: ${baseDir}\n`);

        let downloaded = 0;
        let failed = 0;
        const failedUrls = [];

        for (const tier of tiers) {
            for (const enchant of enchantments) {
                for (const quality of qualities) {
                    const itemCode = `T${tier}_${weaponType}_${weaponName}@${enchant}`;
                    const url = `https://render.albiononline.com/v1/item/${itemCode}?quality=${quality}`;
                    const filename = `${itemCode}.png`;
                    const filepath = path.join(baseDir, `T${tier}`, `@${enchant}`, `quality=${quality}`, filename);

                    try {
                        await downloadImage(url, filepath);
                        downloaded++;
                    } catch (error) {
                        failed++;
                        failedUrls.push({ url, error: error.message });
                    }

                    // Update progress
                    const progress = downloaded + failed;
                    const percentage = ((progress / totalImages) * 100).toFixed(1);
                    process.stdout.write(`\r⏳ Progress: ${progress}/${totalImages} (${percentage}%) | ✅ ${downloaded} succeeded | ❌ ${failed} failed`);
                }
            }
        }

        console.log('\n\n' + '='.repeat(50));
        console.log('✨ Download complete!');
        console.log(`✅ Successfully downloaded: ${downloaded} images`);
        console.log(`❌ Failed: ${failed} images`);
        console.log(`📁 Location: ${path.resolve(baseDir)}`);

        if (failed > 0 && failedUrls.length > 0) {
            console.log('\n⚠️  Failed downloads:');
            failedUrls.slice(0, 10).forEach(({ url, error }) => {
                console.log(`   - ${url}`);
                console.log(`     Error: ${error}`);
            });
            if (failedUrls.length > 10) {
                console.log(`   ... and ${failedUrls.length - 10} more`);
            }
        }
        console.log('='.repeat(50));

    } catch (error) {
        console.error('\n❌ Error:', error.message);
    } finally {
        rl.close();
    }
}

main();