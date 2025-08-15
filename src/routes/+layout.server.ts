import type { LayoutServerData } from "./$types";
import type { RequestEvent } from "@sveltejs/kit";

export const load = async ({ locals }: RequestEvent) => {
    return {
        user: locals.user
    }
};