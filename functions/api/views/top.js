import { handleViews } from '../../../shared/views.js'

export const onRequestGet = ({ request, env }) => handleViews(request, env)
