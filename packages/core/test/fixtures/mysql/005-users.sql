-- Canvas-authored fixture: two MySQL users for checkReadOnly. One may only
-- SELECT; the other may also INSERT. {{database}} is replaced by the fixture
-- database's name, so each test database has its own users and test files
-- never share them. The passwords are throwaway test values.

DROP USER IF EXISTS '{{database}}_ro'@'%', '{{database}}_rw'@'%';
CREATE USER '{{database}}_ro'@'%' IDENTIFIED BY 'fixture-ro-pass';
CREATE USER '{{database}}_rw'@'%' IDENTIFIED BY 'fixture-rw-pass';
GRANT SELECT ON `{{database}}`.* TO '{{database}}_ro'@'%';
GRANT SELECT, INSERT ON `{{database}}`.* TO '{{database}}_rw'@'%';
