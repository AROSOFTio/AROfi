-- Rename existing radreply table to radreply_data if it is a base table
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name = 'radreply' 
          AND table_type = 'BASE TABLE'
    ) THEN
        ALTER TABLE radreply RENAME TO radreply_data;
    END IF;
END $$;

-- Create the radreply VIEW that dynamically calculates Session-Timeout from RadiusCredential
CREATE OR REPLACE VIEW radreply AS
SELECT 
    r.id,
    r.username,
    r.attribute,
    r.op,
    CASE 
        WHEN r.attribute = 'Session-Timeout' THEN
            COALESCE(
                GREATEST(
                    1,
                    EXTRACT(EPOCH FROM (c."expiresAt" - NOW()))::integer
                )::varchar,
                r.value
            )
        ELSE r.value
    END as value
FROM radreply_data r
LEFT JOIN "RadiusCredential" c ON c.username = r.username;

-- Create the INSTEAD OF write trigger on radreply view
CREATE OR REPLACE FUNCTION radreply_write_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.id IS NOT NULL THEN
            INSERT INTO radreply_data (id, username, attribute, op, value)
            VALUES (NEW.id, NEW.username, NEW.attribute, NEW.op, NEW.value)
            RETURNING id, username, attribute, op, value INTO NEW;
        ELSE
            INSERT INTO radreply_data (username, attribute, op, value)
            VALUES (NEW.username, NEW.attribute, NEW.op, NEW.value)
            RETURNING id, username, attribute, op, value INTO NEW;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE radreply_data
        SET username = NEW.username, attribute = NEW.attribute, op = NEW.op, value = NEW.value
        WHERE id = OLD.id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        DELETE FROM radreply_data WHERE id = OLD.id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS radreply_write_tg ON radreply;
CREATE TRIGGER radreply_write_tg
INSTEAD OF INSERT OR UPDATE OR DELETE ON radreply
FOR EACH ROW EXECUTE FUNCTION radreply_write_trigger();
