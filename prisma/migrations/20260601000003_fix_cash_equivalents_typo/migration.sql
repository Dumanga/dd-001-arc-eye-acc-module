-- Correct the "EQUIVALANTS" → "EQUIVALENTS" spelling on the Cash & Cash
-- Equivalents account type and subtype. The seed had a typo that leaked into
-- code lookups (filters used "CASH_AND_CASH_EQUIVALANTS" / "CASH & CASH
-- EQUIVALANTS"); this rename flips the canonical strings in the database so
-- everything matches the correct spelling going forward. Same row IDs.

UPDATE `accountingaccounttype`
SET `code` = 'CASH_AND_CASH_EQUIVALENTS', `name` = 'CASH & CASH EQUIVALENTS'
WHERE `code` = 'CASH_AND_CASH_EQUIVALANTS';

UPDATE `accountingaccountsubtype`
SET `code` = 'CASH_AND_CASH_EQUIVALENTS', `name` = 'CASH & CASH EQUIVALENTS'
WHERE `code` = 'CASH_AND_CASH_EQUIVALANTS';
