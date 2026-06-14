const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const readline = require('node:readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

function pipeToFile(response, file, filepath) {
    return new Promise((resolve, reject) => {
        response.pipe(file);
        file.on('finish', () => {
            file.close();
            resolve();
        });
        file.on('error', (err) => {
            fs.unlink(filepath, () => {});
            reject(err);
        });
    });
}

function handleRedirect(location, file, filepath, resolve, reject) {
    https.get(location, (redirectResponse) => {
        pipeToFile(redirectResponse, file, filepath).then(resolve).catch(reject);
    }).on('error', (err) => {
        fs.unlink(filepath, () => {});
        reject(err);
    });
}

async function downloadImage(url, filepath) {
    return new Promise((resolve, reject) => {
        fs.mkdirSync(path.dirname(filepath), { recursive: true });

        const file = fs.createWriteStream(filepath);
        https.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                handleRedirect(response.headers.location, file, filepath, resolve, reject);
                return;
            }

            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${url} (${response.statusCode})`));
                return;
            }

            pipeToFile(response, file, filepath).then(resolve).catch(reject);
        }).on('error', (err) => {
            fs.unlink(filepath, () => {});
            reject(err);
        });
    });
}

async function promptWeaponType() {
    const weaponType = (await question('Enter weapon type (MAIN or 2H): ')).trim().toUpperCase();
    if (weaponType !== 'MAIN' && weaponType !== '2H') {
        throw new Error('Weapon type must be either MAIN or 2H');
    }
    return weaponType;
}

async function promptWeaponName() {
    const weaponName = (await question('Enter unique weapon name (e.g., ARCANESTAFF): ')).trim().toUpperCase();
    if (!weaponName) {
        throw new Error('Weapon name cannot be empty');
    }
    return weaponName;
}

async function downloadAllVariants(weaponType, weaponName) {
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
                const filepath = path.join(baseDir, `T${tier}`, `@${enchant}`, `quality=${quality}`, `${itemCode}.png`);

                try {
                    await downloadImage(url, filepath);
                    downloaded++;
                } catch (error) {
                    failed++;
                    failedUrls.push({ url, error: error.message });
                }

                const progress = downloaded + failed;
                const percentage = ((progress / totalImages) * 100).toFixed(1);
                process.stdout.write(`\r⏳ Progress: ${progress}/${totalImages} (${percentage}%) | ✅ ${downloaded} succeeded | ❌ ${failed} failed`);
            }
        }
    }

    return { downloaded, failed, failedUrls, baseDir };
}

function printSummary(downloaded, failed, failedUrls, baseDir) {
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
}

async function main() {
    try {
        console.log('=== Albion Online Weapon Asset Downloader ===\n');

        const weaponType = await promptWeaponType();
        const weaponName = await promptWeaponName();
        const { downloaded, failed, failedUrls, baseDir } = await downloadAllVariants(weaponType, weaponName);
        printSummary(downloaded, failed, failedUrls, baseDir);
    } catch (error) {
        console.error('\n❌ Error:', error.message);
    } finally {
        rl.close();
    }
}

main();
