import { NextRequest, NextResponse } from 'next/server'
import { addDays } from '@/lib/projection/dates'
import { buildWorkspaceView } from '@/lib/projection-service'

export const dynamic = 'force-dynamic'

/** Strict YYYY-MM-DD check that also rejects impossible calendar dates (e.g. 2025-02-30). */
function isValidDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  try {
    return addDays(value, 0) === value
  } catch {
    return false
  }
}

export async function GET(request: NextRequest) {
  const today = new URL(request.url).searchParams.get('today')
  if (!isValidDate(today)) {
    return NextResponse.json(
      { error: 'Invalid date format. Expected a valid YYYY-MM-DD date.' },
      { status: 400 },
    )
  }

  try {
    const { view, setCookie } = await buildWorkspaceView(request, today)
    const response = NextResponse.json(view.projection)
    if (setCookie) response.headers.append('Set-Cookie', setCookie)
    return response
  } catch (error) {
    console.error('Projection error:', error)
    return NextResponse.json(
      { error: 'Projection failed. Please try again.' },
      { status: 500 },
    )
  }
}
