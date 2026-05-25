import { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, addMonths, subMonths, getDay } from 'date-fns';


const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export default function CalendarView({ tasks, onTaskClick }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  
  const startDay = getDay(monthStart);
  const prevDays = Array(startDay).fill(null);
  
  const allTasks = [
    ...(tasks?.todo || []),
    ...(tasks?.inProgress || []),
    ...(tasks?.review || []),
    ...(tasks?.done || [])
  ];

  const getTasksForDay = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return allTasks.filter(task => task.dueDate === dateStr);
  };

  return (
    <div className="calendar-container">
      <div className="calendar-header">
        <div className="calendar-nav">
          <button 
            className="calendar-nav-btn"
            onClick={() => setCurrentDate(subMonths(currentDate, 1))}
          >
            <ChevronLeft size={18} />
          </button>
          <h2 className="calendar-month">
            {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
          </h2>
          <button 
            className="calendar-nav-btn"
            onClick={() => setCurrentDate(addMonths(currentDate, 1))}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        
        <button 
          className="calendar-nav-btn"
          onClick={() => setCurrentDate(new Date())}
        >
          <CalendarIcon size={18} />
        </button>
      </div>

      <div className="calendar-grid">
        {DAYS.map(day => (
          <div key={day} className="calendar-day-header">{day}</div>
        ))}
        
        {prevDays.map((_, index) => (
          <div key={`prev-${index}`} className="calendar-day other-month" />
        ))}
        
        {days.map(day => {
          const dayTasks = getTasksForDay(day);
          const today = isToday(day);
          
          return (
            <div 
              key={day.toString()} 
              className={`calendar-day ${today ? 'today' : ''}`}
            >
              <div className={`calendar-date ${today ? 'today' : ''}`}>
                {format(day, 'd')}
              </div>
              <div className="calendar-tasks">
                {dayTasks.slice(0, 3).map(task => (
                  <div
                    key={task.id}
                    className={`calendar-task ${task.priority === 'high' ? 'urgent' : ''}`}
                    onClick={() => onTaskClick(task, 'todo')}
                    title={task.title}
                  >
                    {task.title}
                  </div>
                ))}
                {dayTasks.length > 3 && (
                  <div style={{ fontSize: '10px', color: '#64748b' }}>
                    +{dayTasks.length - 3} plus
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}