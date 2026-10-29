import React from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Cpu,
  FileWarning,
  History,
  Lock,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
} from 'lucide-react';
import { Resource, User } from '../types';
import { ResilientImage } from './ResilientImage';

interface LandingViewProps {
  resources: Resource[];
  currentUser: User | null;
  onOpenLogin: (prefilledEmail?: string) => void;
  onOpenWorkspace: () => void;
  onOpenCatalogue: () => void;
  onSelectResource: (resource: Resource) => void;
}

export const LandingView: React.FC<LandingViewProps> = ({
  resources,
  currentUser,
  onOpenLogin,
  onOpenWorkspace,
  onOpenCatalogue,
  onSelectResource,
}) => {
  // Prefer the Arduino Kit as the featured school resource
  const arduinoResource = resources.find((r) => r.code === 'SCH-ARD-04') || resources[0];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 lg:px-10 py-4 bg-white border-b border-slate-200 sticky top-0 z-30">
        {/* Zone 1: Single text wordmark */}
        <a
          href="#top"
          className="text-lg font-bold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0"
        >
          ResourceBridge
        </a>

        {/* Zone 2: 4 concise single-line text links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <button
            type="button"
            onClick={onOpenCatalogue}
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Browse Resources
          </button>
          <a
            href="#how-it-works"
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            How Booking Works
          </a>
          <a
            href="#demo-accounts"
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Try Demo Accounts
          </a>
          <a
            href="#fair-rules"
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Fair Sharing Rules
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => (currentUser ? onOpenWorkspace() : onOpenLogin())}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            {currentUser ? `Go to Workspace (${currentUser.name})` : 'Sign In to Campus Workspace'}
          </button>
        </div>
      </header>

      <main id="top" className="flex-1 max-w-7xl w-full mx-auto px-6 lg:px-10 py-10 space-y-12">
        {/* Hero Section */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-7 lg:p-9 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="text-xs font-mono text-teal-700 font-semibold">
                SHARE AND BOOK SCHOOL &amp; COLLEGE RESOURCES · DEMO SYSTEM
              </div>
              <h1
                className="text-3xl lg:text-4xl font-bold text-slate-900 tracking-tight leading-tight"
                style={{ textWrap: 'balance' }}
              >
                Share underused school equipment, computer labs, and project spaces easily and fairly.
              </h1>
              <p className="text-base text-slate-600 leading-relaxed max-w-2xl">
                ResourceBridge helps students, project teams, and teachers find and book shared school resources—like Arduino starter kits, computer lab slots, 3D printers, and multimeters—while avoiding double bookings and keeping track of equipment condition.
              </p>
            </div>

            <div className="space-y-4 pt-2">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onOpenCatalogue}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-teal-700 rounded-md hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0"
                >
                  Browse Available Resources
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onOpenLogin('aarav.mehta@school-demo.edu')}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                >
                  Sign In as Student (Aarav)
                </button>
                <button
                  type="button"
                  onClick={() => onOpenLogin('p.sharma@school-demo.edu')}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-800 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
                >
                  Sign In as Teacher / Manager
                </button>
              </div>

              <div className="pt-3 border-t border-slate-100 text-xs text-slate-500 flex flex-wrap items-center gap-2">
                <span>Avoid Double Bookings</span>
                <span aria-hidden="true">·</span>
                <span>Condition Before &amp; After Use</span>
                <span aria-hidden="true">·</span>
                <span>Managers Review Important Decisions</span>
                <span aria-hidden="true">·</span>
                <span>Demonstration Dataset</span>
              </div>
            </div>
          </div>

          {/* Featured School Resource Card (Arduino Kit Demonstration) */}
          {arduinoResource && (
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col justify-between">
              <div className="aspect-4/3 lg:h-64 w-full bg-slate-100 border-b border-slate-200 overflow-hidden">
                <ResilientImage
                  src={arduinoResource.imageUrl}
                  alt={arduinoResource.name}
                  code={arduinoResource.code}
                  category={arduinoResource.category}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-semibold text-teal-700">{arduinoResource.code}</span>
                    <span className="text-emerald-700 font-sans font-semibold">Ready to Book</span>
                  </div>
                  <h2 className="text-base font-bold text-slate-900">{arduinoResource.name}</h2>
                  <p className="text-xs text-slate-600 line-clamp-2">{arduinoResource.description}</p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-600">
                    {arduinoResource.location.split('·')[0]}
                  </span>
                  <button
                    type="button"
                    onClick={() => onSelectResource(arduinoResource)}
                    className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    Check &amp; Book Arduino Kit
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* The 8-Step Easy Booking Process */}
        <section id="how-it-works" className="bg-white border border-slate-200 rounded-lg p-6 lg:p-8 space-y-6">
          <div className="space-y-1">
            <div className="text-xs font-mono text-teal-700 font-semibold">SIMPLE BOOKING WORKFLOW</div>
            <h2 className="text-xl font-bold text-slate-900">How to Book and Return Equipment (8 Simple Steps)</h2>
            <p className="text-xs text-slate-600">
              A straightforward process that makes sure everyone gets a fair turn and equipment is kept in good shape.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div className="p-4 rounded-md bg-slate-50 border border-slate-200 space-y-1.5">
              <div className="font-bold font-mono text-teal-700">STEP 1</div>
              <div className="font-semibold text-slate-900">Choose a resource</div>
              <p className="text-slate-600">Browse Arduino kits, computer labs, 3D printers, or project rooms.</p>
            </div>

            <div className="p-4 rounded-md bg-slate-50 border border-slate-200 space-y-1.5">
              <div className="font-bold font-mono text-teal-700">STEP 2</div>
              <div className="font-semibold text-slate-900">Check availability</div>
              <p className="text-slate-600">See real-time schedules so you avoid picking already booked slots.</p>
            </div>

            <div className="p-4 rounded-md bg-slate-50 border border-slate-200 space-y-1.5">
              <div className="font-bold font-mono text-teal-700">STEP 3</div>
              <div className="font-semibold text-slate-900">Select date and time</div>
              <p className="text-slate-600">Pick how long you need it (usually 1 to 3 hours per slot).</p>
            </div>

            <div className="p-4 rounded-md bg-slate-50 border border-slate-200 space-y-1.5">
              <div className="font-bold font-mono text-teal-700">STEP 4</div>
              <div className="font-semibold text-slate-900">Explain why it is needed</div>
              <p className="text-slate-600">Write a quick note describing your class or team project purpose.</p>
            </div>

            <div className="p-4 rounded-md bg-slate-50 border border-slate-200 space-y-1.5">
              <div className="font-bold font-mono text-teal-700">STEP 5</div>
              <div className="font-semibold text-slate-900">Submit the request</div>
              <p className="text-slate-600">Agree to basic safety rules and submit your request in one click.</p>
            </div>

            <div className="p-4 rounded-md bg-slate-50 border border-slate-200 space-y-1.5">
              <div className="font-bold font-mono text-teal-700">STEP 6</div>
              <div className="font-semibold text-slate-900">Manager reviews it</div>
              <p className="text-slate-600">The teacher or lab manager checks for overlaps and approves or waitlists.</p>
            </div>

            <div className="p-4 rounded-md bg-slate-50 border border-slate-200 space-y-1.5">
              <div className="font-bold font-mono text-teal-700">STEP 7</div>
              <div className="font-semibold text-slate-900">Check in and use it</div>
              <p className="text-slate-600">Record condition before starting, use the item, and finish on time.</p>
            </div>

            <div className="p-4 rounded-md bg-slate-50 border border-slate-200 space-y-1.5">
              <div className="font-bold font-mono text-teal-700">STEP 8</div>
              <div className="font-semibold text-slate-900">Check out &amp; report issues</div>
              <p className="text-slate-600">Record condition after use and report any missing or broken parts.</p>
            </div>
          </div>
        </section>

        {/* Demonstration Accounts Section */}
        <section id="demo-accounts" className="space-y-4">
          <div>
            <div className="text-xs font-mono text-teal-700 font-semibold">ROLE-BASED DEMO ACCOUNTS</div>
            <h2 className="text-xl font-bold text-slate-900 mt-1">Try the System as Different Users</h2>
            <p className="text-xs text-slate-600">
              Switch roles to experience how students book, teachers manage, and administrators set campus sharing rules.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Student Role */}
            <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="text-xs font-mono text-teal-700 font-semibold">STUDENT ROLE</div>
                <h3 className="text-base font-bold text-slate-900">Aarav Mehta</h3>
                <div className="text-xs text-slate-600">
                  College Tech Club &amp; Science Projects · Student ID: 2026-STU-01
                </div>
                <ul className="text-xs text-slate-600 space-y-1 pt-2 list-disc pl-4">
                  <li>Browse Arduino kits, labs, and tools</li>
                  <li>Check availability and submit requests</li>
                  <li>Check in and submit condition reports</li>
                  <li>Report missing wires or problems</li>
                </ul>
              </div>
              <button
                type="button"
                onClick={() => onOpenLogin('aarav.mehta@school-demo.edu')}
                className="w-full py-2 px-4 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors"
              >
                Sign In as Student (Aarav)
              </button>
            </div>

            {/* Teacher / Resource Manager Role */}
            <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="text-xs font-mono text-teal-700 font-semibold">TEACHER / MANAGER ROLE</div>
                <h3 className="text-base font-bold text-slate-900">Mrs. Priya Sharma</h3>
                <div className="text-xs text-slate-600">
                  Science &amp; Computer Labs Resource Coordinator
                </div>
                <ul className="text-xs text-slate-600 space-y-1 pt-2 list-disc pl-4">
                  <li>Review incoming requests</li>
                  <li>Approve, Not Approve, or Waitlist with notes</li>
                  <li>Avoid double bookings on the same slot</li>
                  <li>Review return condition reports &amp; problems</li>
                </ul>
              </div>
              <button
                type="button"
                onClick={() => onOpenLogin('p.sharma@school-demo.edu')}
                className="w-full py-2 px-4 text-xs font-semibold text-white bg-teal-700 rounded-md hover:bg-teal-800 transition-colors"
              >
                Sign In as Lab Manager (Mrs. Sharma)
              </button>
            </div>

            {/* Principal / Administrator Role */}
            <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="text-xs font-mono text-teal-700 font-semibold">CAMPUS ADMINISTRATOR ROLE</div>
                <h3 className="text-base font-bold text-slate-900">Dr. Ananya Deshmukh</h3>
                <div className="text-xs text-slate-600">
                  Principal &amp; Head of Campus Facilities
                </div>
                <ul className="text-xs text-slate-600 space-y-1 pt-2 list-disc pl-4">
                  <li>View school booking &amp; activity history</li>
                  <li>Make sure equipment is shared fairly</li>
                  <li>Set weekly student hour limits</li>
                  <li>Protect student privacy automatically</li>
                </ul>
              </div>
              <button
                type="button"
                onClick={() => onOpenLogin('ananya.deshmukh@school-demo.edu')}
                className="w-full py-2 px-4 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
              >
                Sign In as Administrator (Dr. Deshmukh)
              </button>
            </div>
          </div>
        </section>

        {/* Fair Sharing & Safety Guarantees */}
        <section id="fair-rules" className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-2">
            <SlidersHorizontal className="w-5 h-5 text-teal-700" />
            <h3 className="text-sm font-bold text-slate-900">Avoid Double Bookings</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              If an item is approved for a time slot, the system blocks overlapping approvals so students never arrive to find their reserved gear taken.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-2">
            <ClipboardCheck className="w-5 h-5 text-teal-700" />
            <h3 className="text-sm font-bold text-slate-900">Condition Checks</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Students record item condition when taking an item and when returning it, preventing confusion over who caused any pre-existing wear.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-2">
            <Scale className="w-5 h-5 text-teal-700" />
            <h3 className="text-sm font-bold text-slate-900">Fair Sharing Quotas</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Transparent weekly hour limits ensure that one student or team does not monopolize shared equipment before science fairs or exams.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-2">
            <ShieldCheck className="w-5 h-5 text-teal-700" />
            <h3 className="text-sm font-bold text-slate-900">Managers Review Decisions</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              No automatic punishments or suspensions. Real teachers and lab managers review any reported issues before decisions are made.
            </p>
          </div>
        </section>
      </main>

      <footer className="bg-white border-t border-slate-200 py-5 px-6 lg:px-10 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div>
          ResourceBridge · Shared School and College Resources · Demonstration Mode
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onOpenCatalogue}
            className="hover:text-slate-900 underline"
          >
            Browse Resources
          </button>
          <button
            type="button"
            onClick={() => onOpenLogin('aarav.mehta@school-demo.edu')}
            className="hover:text-slate-900 underline"
          >
            Student Sign In
          </button>
          <button
            type="button"
            onClick={() => onOpenLogin('p.sharma@school-demo.edu')}
            className="hover:text-slate-900 underline"
          >
            Manager Sign In
          </button>
        </div>
      </footer>
    </div>
  );
};
