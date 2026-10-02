import { handleViews } from '../../shared/views.js'

export const onRequestGet = ({ request, env }) => handleViews(request, env)
export const onRequestPost = ({ request, env }) => handleViews(request, env)
