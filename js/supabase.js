// js/supabase.js
const SUPABASE_URL = 'https://gpscydpozepmsupsjrbw.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdwc2N5ZHBvemVwbXN1cHNqcmJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2NjIxOTksImV4cCI6MjEwMTIzODE5OX0.vFOzR9k6HPS-Td582-vrChU4lhTf-0OFEh3AhjlMTeM'

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export { supabase }