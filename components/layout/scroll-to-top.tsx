'use client'

// React Imports
import { useEffect, useState } from 'react'

// Third-party Imports
import { usePathname } from 'next/navigation'
import { ArrowUpIcon } from 'lucide-react'

// Component Imports
import { Button } from '@/components/ui/button'

// Util Imports
import { cn } from '@/lib/utils'

// No scroll-to-top button on the invoice and quote create pages (chooser and forms),
// nor the KM trip editor: its pinned Cancel / Save bar sits where the button would.
const HIDDEN_PATHS = /^\/(invoices|quotes)\/new(\/|$)|^\/km-tracker\/(new|[^/]+\/edit)(\/|$)/

const ScrollToTop = () => {
  // Hooks
  const pathname = usePathname()

  // States
  const [showScrollButton, setShowScrollButton] = useState(false)

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }

  useEffect(() => {
    const handleScroll = () => {
      // Show button when scrolled down 320px or more
      setShowScrollButton(window.scrollY > 320)
    }

    window.addEventListener('scroll', handleScroll)
    handleScroll()

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  if (HIDDEN_PATHS.test(pathname ?? '')) return null

  return (
    <Button
      size='icon'
      className={cn('fixed right-4 bottom-8 z-50 cursor-pointer rounded-full transition-all duration-200', {
        'scale-0': !showScrollButton
      })}
      onClick={scrollToTop}
    >
      <ArrowUpIcon />
      <span className='sr-only'>Scroll to top</span>
    </Button>
  )
}

export default ScrollToTop
