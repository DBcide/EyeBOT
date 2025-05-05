const fs = require('fs');
const path = require('path');
const { promisePool } = require('./db'); // 👈 adapte le chemin si besoin

const emojiMap = require('./emojiMap.json');
const missingEmojisFilePath = path.join(__dirname, 'missingEmojis.txt');

(async () => {
  let updatedCount = 0;
  const missingEmojis = [];

  try {
    // On parcourt chaque entrée du fichier emojiMap
    for (const [imgName, emojiId] of Object.entries(emojiMap)) {
      const upperImgName = imgName.toUpperCase(); // Convertir le nom du sort en majuscule

      // Sélectionner le sort dans la base de données où le nom correspond à l'imgName
      const [rows] = await promisePool.execute(
        'SELECT * FROM spells WHERE img = ?',
        [upperImgName]
      );

      if (rows.length > 0) {
        const spell = rows[0]; // On suppose qu'il y a un seul sort correspondant

        // Mise à jour de l'idEmoji du sort dans la base de données
        const [updateResult] = await promisePool.execute(
          'UPDATE spells SET idEmoji = ? WHERE id = ?',
          [emojiId, spell.id]
        );

        if (updateResult.affectedRows > 0) {
          console.log(`✅ Le sort "${upperImgName}" a été mis à jour avec l'emoji ID ${emojiId}`);
          updatedCount++;
        }
      } else {
        // Si aucun sort n'a été trouvé, on l'ajoute à la liste des sorts manquants
        console.warn(`⚠️ Aucun sort trouvé pour img = "${upperImgName}"`);
        missingEmojis.push(upperImgName);
      }
    }

    console.log(`\n✅ Mise à jour terminée. Sorts modifiés : ${updatedCount}`);

    // Écrire la liste des sorts manquants dans un fichier
    if (missingEmojis.length > 0) {
      fs.writeFileSync(missingEmojisFilePath, missingEmojis.join('\n'), 'utf-8');
      console.log(`🚨 Liste des sorts sans emoji enregistrée dans : ${missingEmojisFilePath}`);
    } else {
      console.log('🟢 Aucun sort manquant !');
    }
  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour :', error);
  } finally {
    // Pas besoin de fermer promisePool manuellement
    process.exit(0);
  }
})();