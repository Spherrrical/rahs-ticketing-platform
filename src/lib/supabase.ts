import {createClient} from "@supabase/supabase-js";

export const supabase = createClient(
    'https://kjkmzkfeibbptjwkooqd.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtqa216a2ZlaWJicHRqd2tvb3FkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzI3NjA0NDksImV4cCI6MjA0ODMzNjQ0OX0.--yp7dVVe1Eao4mmrRJlO23HEegbJoDywi53i_VD-4U'
)
