import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AppIconComponent } from './icon.component';

describe('AppIconComponent', () => {
  let fixture: ComponentFixture<AppIconComponent>;
  let component: AppIconComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppIconComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(AppIconComponent);
    component = fixture.componentInstance;
    component.name = 'refresh';
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('should create the icon component', () => {
    expect(component).toBeTruthy();
  });

  it('should set numeric width and height attributes by default (20)', () => {
    const svg: SVGElement = fixture.nativeElement.querySelector('svg');
    expect(svg.getAttribute('width')).toBe('20');
    expect(svg.getAttribute('height')).toBe('20');
  });

  it('should set custom numeric width and height attributes', () => {
    fixture.componentRef.setInput('size', 28);
    fixture.detectChanges();

    const svg: SVGElement = fixture.nativeElement.querySelector('svg');
    expect(svg.getAttribute('width')).toBe('28');
    expect(svg.getAttribute('height')).toBe('28');
  });

  it('should omit width and height attributes and apply class for responsive token "sm"', () => {
    fixture.componentRef.setInput('size', 'sm');
    fixture.detectChanges();

    const svg: SVGElement = fixture.nativeElement.querySelector('svg');
    expect(svg.getAttribute('width')).toBeNull();
    expect(svg.getAttribute('height')).toBeNull();
    expect(svg.classList.contains('icon-sm')).toBe(true);
  });

  it('should omit width and height attributes and apply class for responsive token "md"', () => {
    fixture.componentRef.setInput('size', 'md');
    fixture.detectChanges();

    const svg: SVGElement = fixture.nativeElement.querySelector('svg');
    expect(svg.getAttribute('width')).toBeNull();
    expect(svg.getAttribute('height')).toBeNull();
    expect(svg.classList.contains('icon-md')).toBe(true);
  });

  it('should omit width and height attributes and apply class for responsive token "lg"', () => {
    fixture.componentRef.setInput('size', 'lg');
    fixture.detectChanges();

    const svg: SVGElement = fixture.nativeElement.querySelector('svg');
    expect(svg.getAttribute('width')).toBeNull();
    expect(svg.getAttribute('height')).toBeNull();
    expect(svg.classList.contains('icon-lg')).toBe(true);
  });

  it('should omit width and height attributes and apply class for responsive token "inherit"', () => {
    fixture.componentRef.setInput('size', 'inherit');
    fixture.detectChanges();

    const svg: SVGElement = fixture.nativeElement.querySelector('svg');
    expect(svg.getAttribute('width')).toBeNull();
    expect(svg.getAttribute('height')).toBeNull();
    expect(svg.classList.contains('icon-inherit')).toBe(true);
  });
});
