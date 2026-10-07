-- Canvas-authored fixture: one column of each kind whose value conversion
-- Canvas decides (Alex's CORE-6 decision 6a). Name and row are invented.

CREATE TABLE canvas_values (
  id int unsigned NOT NULL,
  big bigint unsigned NOT NULL,
  safe_big bigint NOT NULL,
  price decimal(10,2) NOT NULL,
  happened datetime NOT NULL,
  day date NOT NULL,
  data blob,
  flags bit(8) NOT NULL,
  doc json,
  maybe int,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO canvas_values VALUES
  (1, 18446744073709551615, 42, 12.50, '2026-10-07 12:34:56', '2026-10-07',
   x'00010203', b'00000101', '{"a": [1, 2]}', NULL);
