-- Canvas-authored fixture: a profile table with no primary key, shaped like
-- the clean schema's playercreateinfo_cast_spell
-- (core:data/sql/base/db_world/playercreateinfo_cast_spell.sql:23-28). Its
-- rows are identified by the profile's key columns (raceMask, classMask,
-- spell); `note` is outside the key. The rows are invented, and two of them
-- are deliberately identical, note included.

CREATE TABLE playercreateinfo_cast_spell (
  raceMask int unsigned NOT NULL DEFAULT '0',
  classMask int unsigned NOT NULL DEFAULT '0',
  spell int unsigned NOT NULL DEFAULT '0',
  note varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO playercreateinfo_cast_spell (raceMask, classMask, spell, note) VALUES
  (0, 128, 116, 'Mage - Frostbolt'),
  (1, 0, 133, NULL),
  (0, 128, 116, 'Mage - Frostbolt');
