"""add user_login_logs table

Revision ID: a1c2e3f4b5d6
Revises: 4f69ee0a186c
Create Date: 2026-05-26 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'a1c2e3f4b5d6'
down_revision = '4f69ee0a186c'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'user_login_logs',
        sa.Column('id',           sa.Integer(),                          nullable=False),
        sa.Column('user_id',      sa.Integer(),                          nullable=False),
        sa.Column('logged_in_at', sa.DateTime(timezone=True),            nullable=False,
                  server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_login_log_user_date', 'user_login_logs',
                    ['user_id', 'logged_in_at'], unique=False)


def downgrade():
    op.drop_index('ix_login_log_user_date', table_name='user_login_logs')
    op.drop_table('user_login_logs')
