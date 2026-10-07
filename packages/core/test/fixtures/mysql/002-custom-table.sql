-- Canvas-authored fixture: a table no profile defines, as a customized
-- server would add. The mysql reader must list it as a custom table and
-- never read it as links. Name and rows are invented.

CREATE TABLE custom_reward (
  id int unsigned NOT NULL,
  spell int unsigned NOT NULL DEFAULT '0',
  note varchar(64) NOT NULL DEFAULT '',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO custom_reward (id, spell, note) VALUES
  (1, 116, 'fixture row');
