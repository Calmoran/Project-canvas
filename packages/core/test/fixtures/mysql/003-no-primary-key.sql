-- Canvas-authored fixture: a profile table with no primary key, shaped like
-- the clean schema's playercreateinfo_cast_spell
-- (core:data/sql/base/db_world/playercreateinfo_cast_spell.sql:23-28; the
-- note column is left out). Its rows are identified by the profile's key
-- columns (raceMask, classMask, spell). The rows are invented, and two of
-- them are deliberately identical.

CREATE TABLE playercreateinfo_cast_spell (
  raceMask int unsigned NOT NULL DEFAULT '0',
  classMask int unsigned NOT NULL DEFAULT '0',
  spell int unsigned NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO playercreateinfo_cast_spell (raceMask, classMask, spell) VALUES
  (0, 128, 116),
  (1, 0, 133),
  (0, 128, 116);
