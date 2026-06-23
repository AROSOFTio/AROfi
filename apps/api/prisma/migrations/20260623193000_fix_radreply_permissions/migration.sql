-- Ensure FreeRADIUS (and all database users) have permissions to read/write the view and underlying table
GRANT ALL PRIVILEGES ON radreply TO PUBLIC;
GRANT ALL PRIVILEGES ON radreply_data TO PUBLIC;
