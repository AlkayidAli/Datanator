import PostgreSQL from "$lib/common/DB_Postgresql";
import { fail, redirect, type Actions } from "@sveltejs/kit";

export const actions ={
    create: async({request , cookies}) =>{

        const data = await request.formData();

        const email = data.get('email');
        const password = data.get('password');
        const confirmPassword = data.get('confirm-password');

        if(!email || email?.toString().trim() == `` || !password || password?.toString().trim() == `` || !confirmPassword || confirmPassword?.toString().trim() == ``) {
            return fail(400, { message: 'All fields are required' });
        }

        if(password !== confirmPassword) {
            return fail(400, { message: 'Passwords do not match' });
        }

        // create user - get id
        const sql = `insert into data.users (email, hash_password) values ($1, crypt($2, gen_salt('bf', 8))) returning * `
        const result = await PostgreSQL().query(sql, [email, password]);
        if (!result.rowCount || !result.rows[0]) {
            return fail(500, { message: 'Could not create user.' });
        }
        const user_id: number = result.rows[0].user_id;

        // save session get GUID
        const sessionSQL = `insert into data.session(user_id, date_expired) values ($1, now() + interval '8 hour') returning guid_id`
        const sessionRows = await PostgreSQL().query(sessionSQL, [user_id])
        const session_guid_id = sessionRows.rows[0].guid_id

        // set cookie (same name as login)
        cookies.set('svelte_app_session', session_guid_id, {
            path: '/',
            maxAge: 60*60*8 // 8 hours
        })

        return redirect(303, '/')
    }
} satisfies Actions;
