/**
 * Setup global des tests (chargé après l'environnement Jest, cf. setupFilesAfterEnv dans jest.config.js)
 *
 * Les commandes résolvent la langue de l'utilisateur via LocaleService, qui lit la table
 * user_preferences. En test, aucune préférence n'est enregistrée et aucune requête MySQL
 * ne doit partir : la langue vient donc de `interaction.locale`, sinon du français par défaut.
 *
 * spyOn (et non un remplacement définitif) : un test peut appeler jest.restoreAllMocks()
 * pour tester le vrai LocaleService (cf. tests/shared/services/LocaleService.test.ts).
 */
import { LocaleService } from '@/shared/services/LocaleService';

beforeEach(() => {
    jest.spyOn(LocaleService.prototype, 'getUserLocale').mockResolvedValue(null);
});
