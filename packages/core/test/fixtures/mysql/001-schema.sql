-- Canvas-authored MySQL fixture for the mysql reader's tests.
--
-- These tables are shaped like two of the profile's tables: the same table
-- names, key columns and column types as the clean AzerothCore schema, cut
-- down to the columns the tests need. Never load the AzerothCore dump here
-- (architecture section 11). Column sources, in the clean checkout:
--   creature_template: data/sql/base/db_world/creature_template.sql:24,30,79
--   trainer_spell:     data/sql/base/db_world/trainer_spell.sql:24-25,34
--
-- The rows are invented test data, not game content.

CREATE TABLE creature_template (
  entry int unsigned NOT NULL DEFAULT '0',
  name char(100) NOT NULL DEFAULT '0',
  PRIMARY KEY (entry)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE trainer_spell (
  TrainerId int unsigned NOT NULL DEFAULT '0',
  SpellId int unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (TrainerId, SpellId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO creature_template (entry, name) VALUES
  (1, 'Fixture Trainer'),
  (2, 'Fixture Creature');

INSERT INTO trainer_spell (TrainerId, SpellId) VALUES
  (1, 116),
  (1, 133);
