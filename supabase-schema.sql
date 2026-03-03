// Existing + 
CREATE EXTENSION vector;
ALTER TABLE voices ADD COLUMN embedding VECTOR(512);
CREATE INDEX ON voices USING ivfflat (embedding vector_cosine_ops);