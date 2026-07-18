import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useUser } from './UserContext'

const EditLockContext = createContext({
  editingLocked: false,
  setEditingLocked: () => {},
  toggleEditingLock: () => {}
})

export function EditLockProvider({ children }) {
  const { user } = useUser()
  const [editingLocked, setEditingLocked] = useState(false)

  useEffect(() => {
    if (!user?.id) {
      setEditingLocked(false)
      return
    }

    const savedValue = localStorage.getItem(`panini_edit_locked_${user.id}`)
    setEditingLocked(savedValue === '1')
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return
    localStorage.setItem(`panini_edit_locked_${user.id}`, editingLocked ? '1' : '0')
  }, [editingLocked, user?.id])

  const toggleEditingLock = useCallback(() => {
    setEditingLocked(previous => !previous)
  }, [])

  const value = useMemo(() => ({
    editingLocked,
    setEditingLocked,
    toggleEditingLock
  }), [editingLocked, toggleEditingLock])

  return (
    <EditLockContext.Provider value={value}>
      {children}
    </EditLockContext.Provider>
  )
}

export const useEditLock = () => useContext(EditLockContext)
